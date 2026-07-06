import { GitHostError } from "#8974ac53d713";
import { text } from "#62f869522d1f";

import type { ExpressionToken } from "./types.js";

const EXPRESSION_WRAPPER = /^\s*\$\{\{\s*([\s\S]*?)\s*\}\}\s*$/;

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

function tokenizeQuotedString(source: string, input: string, start: number) {
  const quote = source[start] || "";
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    const current = source[index] || "";
    if (current === "\\") {
      value += source[index + 1] || "";
      index += 2;
      continue;
    }
    if (current === quote) return { index: index + 1, token: { type: "string", value } satisfies ExpressionToken };
    value += current;
    index += 1;
  }
  throw new GitHostError("forge_invalid_workflow_definition", "Unterminated workflow expression string literal.", {
    expression: input,
  });
}

function tokenizeIdentifier(source: string, start: number) {
  let value = source[start] || "";
  let index = start + 1;
  while (index < source.length && isIdentifierChar(source[index] || "")) {
    value += source[index] || "";
    index += 1;
  }
  if (value === "true" || value === "false") {
    return {
      index,
      token: { type: "boolean", value: value === "true" } satisfies ExpressionToken,
    };
  }
  return {
    index,
    token: { type: "identifier", value } satisfies ExpressionToken,
  };
}

function readOperatorToken(source: string, index: number): ExpressionToken | null {
  const char = source[index] || "";
  if (char === "(") return { type: "lparen" };
  if (char === ")") return { type: "rparen" };
  if (char === ".") return { type: "dot" };
  if (char === "!" && source[index + 1] === "=") return { type: "neq" };
  if (char === "=" && source[index + 1] === "=") return { type: "eq" };
  if (char === "&" && source[index + 1] === "&") return { type: "and" };
  if (char === "|" && source[index + 1] === "|") return { type: "or" };
  if (char === "!") return { type: "not" };
  return null;
}

function operatorWidth(token: ExpressionToken) {
  return token.type === "and" || token.type === "or" || token.type === "eq" || token.type === "neq" ? 2 : 1;
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
    const operator = readOperatorToken(source, index);
    if (operator) {
      tokens.push(operator);
      index += operatorWidth(operator);
      continue;
    }
    if (char === "'" || char === "\"") {
      const quoted = tokenizeQuotedString(source, input, index);
      tokens.push(quoted.token);
      index = quoted.index;
      continue;
    }
    if (isIdentifierStart(char)) {
      const identifier = tokenizeIdentifier(source, index);
      tokens.push(identifier.token);
      index = identifier.index;
      continue;
    }
    throw new GitHostError("forge_invalid_workflow_definition", `Unsupported token "${char}" in workflow expression.`, {
      expression: input,
    });
  }
  tokens.push({ type: "eof" });
  return tokens;
}

export { tokenizeExpression };
