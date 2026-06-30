import type { CreateGitForgeActionsOptions, GitForgeWorkflowRun, GitForgeWorkflowRunStep } from "#1mbdfxwwqqpa";

function sanitizeSecretValues(secrets: Record<string, string> | undefined) {
  return Array.from(new Set(Object.values(secrets || {}).filter(Boolean)))
    .sort((left, right) => right.length - left.length);
}

function redactSecrets(input: string, secrets: string[]) {
  let next = input;
  for (const secret of secrets) {
    next = next.split(secret).join("***");
  }
  return next;
}

function createRunRedactor(
  actions: CreateGitForgeActionsOptions | undefined,
  run: GitForgeWorkflowRun,
  step: GitForgeWorkflowRunStep,
  secrets: Record<string, string> | undefined,
) {
  const secretValues = sanitizeSecretValues(secrets);
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
  createRunRedactor,
  redactSecrets,
};
