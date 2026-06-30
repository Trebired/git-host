import { GitHostError } from "#8974ac53d713";
import { text } from "#62f869522d1f";

type WorkflowExpressionContext = {
  env?: Record<string, unknown>;
  github?: Record<string, unknown>;
  job?: Record<string, unknown>;
  matrix?: Record<string, unknown>;
  needs?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
};

type ExpressionToken =
  | { type: "boolean"; value: boolean }
  | { type: "dot" }
  | { type: "eof" }
  | { type: "identifier"; value: string }
  | { type: "lparen" }
  | { type: "neq" }
  | { type: "not" }
  | { type: "or" }
  | { type: "and" }
  | { type: "eq" }
  | { type: "rparen" }
  | { type: "string"; value: string };

const EXPRESSION_WRAPPER = /^\s*\$\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const SUPPORTED_FUNCTIONS = new Set(["always", "cancelled", "failure", "success"]);

function unwrapExpression(input: string) {
  const raw = text(input);
  const match = raw.match(EXPRESSION_WRAPPER);
  return match ? text(match[1]) : raw;
}

function isIdentifierStart(char: string) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierChar(char: string) {
  return /[A-Za-z0-9_-]/.test(char);
}

function tokenizeExpression(input: string): ExpressionToken[] {
  const source = unwrapExpression(input);
  const tokens: ExpressionToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] || "";
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }
    if (char === ".") {
      tokens.push({ type: "dot" });
      index += 1;
      continue;
    }
    if (char === "!" && source[index + 1] === "=") {
      tokens.push({ type: "neq" });
      index += 2;
      continue;
    }
    if (char === "=" && source[index + 1] === "=") {
      tokens.push({ type: "eq" });
      index += 2;
      continue;
    }
    if (char === "&" && source[index + 1] === "&") {
      tokens.push({ type: "and" });
      index += 2;
      continue;
    }
    if (char === "|" && source[index + 1] === "|") {
      tokens.push({ type: "or" });
      index += 2;
      continue;
    }
    if (char === "!") {
      tokens.push({ type: "not" });
      index += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      const quote = char;
      let value = "";
      index += 1;
      while (index < source.length) {
        const current = source[index] || "";
        if (current === "\\") {
          value += source[index + 1] || "";
          index += 2;
          continue;
        }
        if (current === quote) break;
        value += current;
        index += 1;
      }
      if ((source[index] || "") !== quote) {
        throw new GitHostError("forge_invalid_workflow_definition", "Unterminated workflow expression string literal.", {
          expression: input,
        });
      }
      index += 1;
      tokens.push({ type: "string", value });
      continue;
    }
    if (isIdentifierStart(char)) {
      let value = char;
      index += 1;
      while (index < source.length && isIdentifierChar(source[index] || "")) {
        value += source[index] || "";
        index += 1;
      }
      if (value === "true") {
        tokens.push({ type: "boolean", value: true });
        continue;
      }
      if (value === "false") {
        tokens.push({ type: "boolean", value: false });
        continue;
      }
      tokens.push({ type: "identifier", value });
      continue;
    }
    throw new GitHostError("forge_invalid_workflow_definition", `Unsupported token "${char}" in workflow expression.`, {
      expression: input,
    });
  }
  tokens.push({ type: "eof" });
  return tokens;
}

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

function createExpressionReader(tokens: ExpressionToken[], context: WorkflowExpressionContext) {
  let index = 0;

  function current() {
    return tokens[index] || { type: "eof" as const };
  }

  function advance() {
    index += 1;
  }

  function expect(type: ExpressionToken["type"]) {
    if (current().type !== type) {
      throw new GitHostError("forge_invalid_workflow_definition", `Unexpected token "${current().type}" in workflow expression.`, {
        expected: type,
      });
    }
    advance();
  }

  function parseValue(): unknown {
    const token = current();
    if (token.type === "boolean") {
      advance();
      return token.value;
    }
    if (token.type === "string") {
      advance();
      return token.value;
    }
    if (token.type === "identifier") {
      const first = token.value;
      advance();
      if (current().type === "lparen") {
        if (!SUPPORTED_FUNCTIONS.has(first)) {
          throw new GitHostError("forge_invalid_workflow_definition", `Unsupported workflow expression function "${first}()".`, {
            function: first,
          });
        }
        advance();
        expect("rparen");
        if (first === "always") return true;
        if (first === "success") return !booleanValue(readPathValue(context, ["job", "cancelled"])) && text(readPathValue(context, ["job", "status"])) !== "failed";
        if (first === "failure") return text(readPathValue(context, ["job", "status"])) === "failed";
        if (first === "cancelled") return text(readPathValue(context, ["job", "status"])) === "cancelled";
      }
      const pathSegments = [first];
      while (current().type === "dot") {
        advance();
        const nextToken = current();
        if (nextToken.type !== "identifier") {
          throw new GitHostError("forge_invalid_workflow_definition", "Invalid workflow expression path.", {});
        }
        pathSegments.push(nextToken.value);
        advance();
      }
      return readPathValue(context, pathSegments);
    }
    if (token.type === "lparen") {
      advance();
      const value = parseOr();
      expect("rparen");
      return value;
    }
    throw new GitHostError("forge_invalid_workflow_definition", `Unexpected token "${token.type}" in workflow expression.`, {});
  }

  function parseUnary(): unknown {
    if (current().type === "not") {
      advance();
      return !booleanValue(parseUnary());
    }
    return parseValue();
  }

  function parseEquality(): unknown {
    let left = parseUnary();
    while (current().type === "eq" || current().type === "neq") {
      const operator = current().type;
      advance();
      const right = parseUnary();
      const leftValue = coerceComparisonValue(left);
      const rightValue = coerceComparisonValue(right);
      left = operator === "eq" ? leftValue === rightValue : leftValue !== rightValue;
    }
    return left;
  }

  function parseAnd(): unknown {
    let left = parseEquality();
    while (current().type === "and") {
      advance();
      left = booleanValue(left) && booleanValue(parseEquality());
    }
    return left;
  }

  function parseOr(): unknown {
    let left = parseAnd();
    while (current().type === "or") {
      advance();
      left = booleanValue(left) || booleanValue(parseAnd());
    }
    return left;
  }

  return {
    parse() {
      const value = parseOr();
      if (current().type !== "eof") {
        throw new GitHostError("forge_invalid_workflow_definition", `Unexpected trailing token "${current().type}" in workflow expression.`, {});
      }
      return value;
    },
  };
}

function resolveWorkflowExpression(input: string, context: WorkflowExpressionContext): unknown {
  const tokens = tokenizeExpression(input);
  return createExpressionReader(tokens, context).parse();
}

function resolveWorkflowString(input: string, context: WorkflowExpressionContext): string {
  return text(input).replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, expression: string) => {
    const value = resolveWorkflowExpression(expression, context);
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  });
}

function resolveWorkflowBoolean(input: unknown, context: WorkflowExpressionContext, fallback = true): boolean {
  const raw = text(input);
  if (!raw) return fallback;
  return booleanValue(resolveWorkflowExpression(raw, context));
}

export {
  booleanValue,
  resolveWorkflowBoolean,
  resolveWorkflowExpression,
  resolveWorkflowString,
};

export type { WorkflowExpressionContext };
