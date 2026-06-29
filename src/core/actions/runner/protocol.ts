import { GitHostError } from "#8974ac53d713";
import type { GitForgeWorkflowRunEvent, GitForgeWorkflowRunStep } from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

import type {
  ActionsRunnerEvent,
  ActionsRunnerInput,
  ExecuteActionsRunnerInput,
  RunnerStepState,
} from "#hzv9f3wx9ez9";

function normalizeStepEnv(step: GitForgeWorkflowRunStep): Record<string, string> | undefined {
  if (!step.metadata?.env || typeof step.metadata.env !== "object") {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(step.metadata.env as Record<string, unknown>)
      .map(([key, value]) => [text(key), text(value)] as const)
      .filter(([key, value]) => key && value),
  );
}

function normalizeRunnerInput(input: ExecuteActionsRunnerInput): ActionsRunnerInput {
  return {
    branch: text(input.run.branch),
    commit_hash: text(input.run.commit_hash),
    env: input.actions?.env,
    heartbeat_interval_ms: input.heartbeatIntervalMs,
    ref: text(input.run.ref, "HEAD"),
    release_id: text(input.run.release_id),
    repository_id: input.run.repository_id,
    repository_path: input.repositoryPath,
    run_id: input.run.id,
    shell: text(input.actions?.shell, "bash"),
    steps: input.steps.map((step) => ({
      command: step.command,
      env: normalizeStepEnv(step),
      id: step.id,
      index: step.index,
      name: step.name,
      shell: text(step.metadata?.shell),
    })),
    workflow_id: input.run.workflow_id,
    workspace_root: input.workspaceRoot,
  };
}

function parseRunnerEvent(line: string): ActionsRunnerEvent {
  const parsed = JSON.parse(line) as ActionsRunnerEvent | GitForgeWorkflowRunEvent;
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new GitHostError("forge_actions_runner_protocol_error", "Actions runner emitted an invalid event payload.", {
      line,
    });
  }
  if (
    parsed.type !== "run.status"
    && parsed.type !== "step.started"
    && parsed.type !== "step.output"
    && parsed.type !== "step.heartbeat"
    && parsed.type !== "step.finished"
  ) {
    throw new GitHostError("forge_actions_runner_protocol_error", `Actions runner emitted unsupported event "${parsed.type}".`, {
      line,
    });
  }
  return parsed as ActionsRunnerEvent;
}

function updateLastStep(event: ActionsRunnerEvent, state: RunnerStepState) {
  if ("step_index" in event && typeof event.step_index === "number") {
    state.lastStepIndex = event.step_index;
  }
  if ("step_name" in event && typeof event.step_name === "string") {
    state.lastStepName = event.step_name;
  }
}

function appendPreview(current: string, chunk: string) {
  const next = `${current}${chunk}`;
  return next.length <= 4000 ? next : next.slice(-4000);
}

export {
  appendPreview,
  normalizeRunnerInput,
  parseRunnerEvent,
  updateLastStep,
};
