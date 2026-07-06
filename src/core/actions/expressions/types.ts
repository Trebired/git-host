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

export type { ExpressionToken, WorkflowExpressionContext };
