import type { CreateGitForgeActionsOptions, GitForgeWorkflowRun, GitForgeWorkflowRunStep } from "#1mbdfxwwqqpa";

function sanitizeSecretValues(values: Iterable<string | undefined>) {
  return Array.from(new Set([...values].filter((value): value is string => Boolean(value))))
    .sort((left, right) => right.length - left.length);
}

// Gathers every value that must be masked from streamed and persisted output:
// all values in the secrets map plus, for any caller-declared sensitive key, the
// resolved value from secrets and from the step environment.
function collectSensitiveValues(input: {
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  sensitiveKeys?: string[];
}) {
  const values: Array<string | undefined> = [...Object.values(input.secrets || {})];
  for (const key of input.sensitiveKeys || []) {
    values.push(input.secrets?.[key], input.env?.[key]);
  }
  return sanitizeSecretValues(values);
}

function redactSecrets(input: string, secrets: string[]) {
  let next = input;
  for (const secret of secrets) {
    next = next.split(secret).join("***");
  }
  return next;
}

function createRunRedactor(input: {
  actions: CreateGitForgeActionsOptions | undefined;
  env?: Record<string, string>;
  run: GitForgeWorkflowRun;
  secrets: Record<string, string> | undefined;
  step: GitForgeWorkflowRunStep;
}) {
  const { actions, run, step } = input;
  const secretValues = collectSensitiveValues({
    env: input.env,
    secrets: input.secrets,
    sensitiveKeys: actions?.environment?.sensitiveKeys,
  });
  return async function redactText(chunk: string, stream: "stderr" | "stdout" = "stdout") {
    let next = redactSecrets(String(chunk || ""), secretValues);
    if (actions?.redactOutput) {
      next = await actions.redactOutput({
        chunk: next,
        run,
        step,
        stream,
      });
    }
    return next;
  };
}

export {
  collectSensitiveValues,
  createRunRedactor,
  redactSecrets,
};
