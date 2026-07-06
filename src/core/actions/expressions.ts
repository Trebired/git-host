import { text } from "#62f869522d1f";

import { booleanValue, createExpressionReader } from "./expressions/read.js";
import { tokenizeExpression } from "./expressions/tokenize.js";
import type { WorkflowExpressionContext } from "./expressions/types.js";

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
