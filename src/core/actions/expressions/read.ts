import { GitHostError } from "#8974ac53d713";
import { text } from "#62f869522d1f";

import type { ExpressionToken, WorkflowExpressionContext } from "./types.js";

const SUPPORTED_FUNCTIONS = new Set(["always", "cancelled", "failure", "success"]);
type ExpressionParserState = {
  context: WorkflowExpressionContext;
  index: number;
  tokens: ExpressionToken[];
};

function readPathValue(context: WorkflowExpressionContext, pathSegments: string[]) {
  let current: unknown = context;
  for (const segment of pathSegments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function booleanValue(input: unknown): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (typeof input === "string") {
    const value = input.trim().toLowerCase();
    if (!value) return false;
    if (value === "false" || value === "0" || value === "null" || value === "undefined") return false;
    return true;
  }
  return Boolean(input);
}

function coerceComparisonValue(input: unknown) {
  if (typeof input === "boolean" || typeof input === "number" || typeof input === "string") return input;
  if (input == null) return "";
  return JSON.stringify(input);
}

function currentToken(state: ExpressionParserState) {
  return state.tokens[state.index] || { type: "eof" as const };
}

function advance(state: ExpressionParserState) {
  state.index += 1;
}

function expectToken(state: ExpressionParserState, type: ExpressionToken["type"]) {
  if (currentToken(state).type !== type) {
    throw new GitHostError("forge_invalid_workflow_definition", `Unexpected token "${currentToken(state).type}" in workflow expression.`, {
      expected: type,
    });
  }
  advance(state);
}

function isJobStatus(context: WorkflowExpressionContext, status: string) {
  return text(readPathValue(context, ["job", "status"])) === status;
}

function parseSupportedFunction(state: ExpressionParserState, name: string) {
  if (!SUPPORTED_FUNCTIONS.has(name)) {
    throw new GitHostError("forge_invalid_workflow_definition", `Unsupported workflow expression function "${name}()".`, {
      function: name,
    });
  }
  advance(state);
  expectToken(state, "rparen");
  if (name === "always") return true;
  if (name === "success") return !isJobStatus(state.context, "failed") && !booleanValue(readPathValue(state.context, ["job", "cancelled"]));
  if (name === "failure") return isJobStatus(state.context, "failed");
  return isJobStatus(state.context, "cancelled");
}

function parseIdentifierValue(state: ExpressionParserState, first: string) {
  if (currentToken(state).type === "lparen") return parseSupportedFunction(state, first);
  const pathSegments = [first];
  while (currentToken(state).type === "dot") {
    advance(state);
    const nextToken = currentToken(state);
    if (nextToken.type !== "identifier") {
      throw new GitHostError("forge_invalid_workflow_definition", "Invalid workflow expression path.", {});
    }
    pathSegments.push(nextToken.value);
    advance(state);
  }
  return readPathValue(state.context, pathSegments);
}

function parseValue(state: ExpressionParserState): unknown {
  const token = currentToken(state);
  if (token.type === "boolean" || token.type === "string") {
    advance(state);
    return token.value;
  }
  if (token.type === "identifier") {
    advance(state);
    return parseIdentifierValue(state, token.value);
  }
  if (token.type === "lparen") {
    advance(state);
    const value = parseOr(state);
    expectToken(state, "rparen");
    return value;
  }
  throw new GitHostError("forge_invalid_workflow_definition", `Unexpected token "${token.type}" in workflow expression.`, {});
}

function parseUnary(state: ExpressionParserState): unknown {
  if (currentToken(state).type !== "not") return parseValue(state);
  advance(state);
  return !booleanValue(parseUnary(state));
}

function parseEquality(state: ExpressionParserState): unknown {
  let left = parseUnary(state);
  while (currentToken(state).type === "eq" || currentToken(state).type === "neq") {
    const operator = currentToken(state).type;
    advance(state);
    const right = parseUnary(state);
    const leftValue = coerceComparisonValue(left);
    const rightValue = coerceComparisonValue(right);
    left = operator === "eq" ? leftValue === rightValue : leftValue !== rightValue;
  }
  return left;
}

function parseAnd(state: ExpressionParserState): unknown {
  let left = parseEquality(state);
  while (currentToken(state).type === "and") {
    advance(state);
    left = booleanValue(left) && booleanValue(parseEquality(state));
  }
  return left;
}

function parseOr(state: ExpressionParserState): unknown {
  let left = parseAnd(state);
  while (currentToken(state).type === "or") {
    advance(state);
    left = booleanValue(left) || booleanValue(parseAnd(state));
  }
  return left;
}

function createExpressionReader(tokens: ExpressionToken[], context: WorkflowExpressionContext) {
  const state: ExpressionParserState = { context, index: 0, tokens };
  return {
    parse() {
      const value = parseOr(state);
      if (currentToken(state).type !== "eof") {
        throw new GitHostError("forge_invalid_workflow_definition", `Unexpected trailing token "${currentToken(state).type}" in workflow expression.`, {});
      }
      return value;
    },
  };
}

export { booleanValue, createExpressionReader };
