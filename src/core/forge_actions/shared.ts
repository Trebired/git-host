import type { ChildProcess } from "node:child_process";

import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeActionsOptions,
  GitForgeActor,
  GitForgeActionsStorage,
  GitForgeWorkflow,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunJobStatus,
  GitForgeWorkflowRunStatus,
  GitForgeWorkflowTriggerKind,
  MaybePromise,
  RunGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { buildStepBaseEnv, runnerNeedsPrivilegeWarning } from "#tda3gxsxcw11";
import { resolveWorkflowBoolean, resolveWorkflowString, type WorkflowExpressionContext } from "#6fxc5ur8a90x";
import { normalizeEnv } from "#0v8uzq2zukc8";
import { resolveRefName } from "#evdr4zn4ntk5";

const ACTIVITY_LISTENER_SYMBOL = Symbol.for("@trebired/git-host/actions-activity-listeners");
const ACTIVITY_WRAPPED_SYMBOL = Symbol.for("@trebired/git-host/actions-activity-wrapped");
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000;
const DEFAULT_LOCAL_RUNNER_LABELS = [
  "bun",
  "linux",
  "local",
  "node",
  "ubuntu",
  "ubuntu-22.04",
  "ubuntu-latest",
];
const TERMINAL_RUN_STATUSES = new Set<GitForgeWorkflowRunStatus>(["cancelled", "failed", "skipped", "success"]);
const TERMINAL_JOB_STATUSES = new Set<GitForgeWorkflowRunJobStatus>(["cancelled", "failed", "skipped", "success"]);

type WorkflowRunListener = (event: GitForgeWorkflowRunEvent) => MaybePromise<void>;

type CreateGitForgeActionsRuntimeOptions = {
  actions: CreateGitForgeActionsOptions | undefined;
  gitHost: import("#1mbdfxwwqqpa").CreateGitForgeOptions["gitHost"];
  releases: import("#1mbdfxwwqqpa").CreateGitForgeOptions["storage"]["releases"];
  storage: GitForgeActionsStorage;
};

type WorkflowQueueItem = {
  repositoryId: string;
  runId: string;
};

type ActiveRunState = {
  cancelRequested: boolean;
  child: ChildProcess | null;
};

type ResolvedExecutionContext = {
  actor?: Record<string, unknown>;
  env: Record<string, string>;
  inputs: Record<string, boolean | string>;
  metadata?: Record<string, unknown>;
  secrets: Record<string, string>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isTerminalRunStatus(status: GitForgeWorkflowRunStatus) {
  return TERMINAL_RUN_STATUSES.has(status);
}

function isTerminalJobStatus(status: GitForgeWorkflowRunJobStatus) {
  return TERMINAL_JOB_STATUSES.has(status);
}

function ensureActionsStorage(storage: GitForgeActionsStorage | undefined): GitForgeActionsStorage {
  if (!storage) {
    throw new GitHostError("forge_actions_not_configured", "Actions storage is required to use repository workflows.");
  }
  return storage;
}

function normalizeRunner(options: CreateGitForgeActionsOptions | undefined) {
  const runner = options?.runner || {};
  const labels = Array.isArray(options?.localRunnerLabels) && options?.localRunnerLabels.length
    ? options.localRunnerLabels.map((entry) => text(entry)).filter(Boolean)
    : DEFAULT_LOCAL_RUNNER_LABELS;
  return {
    capabilities: Array.isArray(runner.capabilities)
      ? runner.capabilities.map((entry) => text(entry)).filter(Boolean)
      : ["artifacts", "env", "expressions", "matrix", "needs", "secrets", "socket-events", "snapshot", "uses"],
    host: text(runner.host, "local-host"),
    id: text(runner.id, "local-runner"),
    kind: text(runner.kind, "local"),
    labels,
    platform_version: text(runner.platform_version, "@trebired/git-host"),
  };
}

function aggregateJobStatus(statuses: GitForgeWorkflowRunJobStatus[]): GitForgeWorkflowRunJobStatus {
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "cancelled")) return "cancelled";
  if (statuses.every((status) => status === "skipped")) return "skipped";
  if (statuses.every((status) => status === "success")) return "success";
  return "queued";
}

function normalizeTriggerContext(input: Record<string, unknown> | undefined) {
  return input && typeof input === "object" ? { ...input } : {};
}

function resolveGithubRef(run: GitForgeWorkflowRun) {
  if (text(run.ref).startsWith("refs/")) return text(run.ref);
  if (run.branch) return `refs/heads/${run.branch}`;
  return text(run.ref, "HEAD");
}

function buildExpressionContext(input: {
  execution: ResolvedExecutionContext;
  extraEnv?: Record<string, string>;
  matrix?: Record<string, boolean | number | string>;
  needs?: Record<string, unknown>;
  run: GitForgeWorkflowRun;
  triggerContext: Record<string, unknown>;
  workflow: GitForgeWorkflow;
}) {
  const githubRef = resolveGithubRef(input.run);
  const eventName = input.run.trigger_kind === "manual" ? "workflow_dispatch" : input.run.trigger_kind;
  return {
    env: {
      ...(input.execution.env || {}),
      ...(input.extraEnv || {}),
    },
    github: {
      actor: text(input.execution.actor?.id, input.run.created_by),
      event: {
        ...input.triggerContext,
        inputs: input.execution.inputs,
      },
      event_name: eventName,
      ref: githubRef,
      ref_name: resolveRefName(githubRef),
      repository: input.run.repository_id,
      run_id: input.run.id,
      sha: input.run.commit_hash,
      workflow: input.workflow.name,
      workflow_ref: input.run.workflow_id,
    },
    job: {
      status: "queued",
    },
    ...(input.matrix ? { matrix: input.matrix } : {}),
    ...(input.needs ? { needs: input.needs } : {}),
    secrets: input.execution.secrets,
  } satisfies WorkflowExpressionContext;
}

function resolveEnvLayer(layer: Record<string, string> | undefined, context: WorkflowExpressionContext) {
  if (!layer) return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(layer)) {
    const envContext = {
      ...context,
      env: {
        ...(context.env || {}),
        ...next,
      },
    } satisfies WorkflowExpressionContext;
    next[key] = resolveWorkflowString(value, envContext);
  }
  return next;
}

function mergeRuntimeEnv(input: {
  actions: CreateGitForgeActionsOptions | undefined;
  execution: ResolvedExecutionContext;
  jobEnv?: Record<string, string>;
  matrix?: Record<string, boolean | number | string>;
  run: GitForgeWorkflowRun;
  stepEnv?: Record<string, string>;
  triggerContext: Record<string, unknown>;
  workflow: GitForgeWorkflow;
}) {
  let env = {
    ...buildStepBaseEnv(input.actions?.environment),
    ...(input.actions?.env || {}),
    ...(input.execution.env || {}),
  } as Record<string, string>;
  let context = buildExpressionContext({
    execution: input.execution,
    extraEnv: env,
    ...(input.matrix ? { matrix: input.matrix } : {}),
    run: input.run,
    triggerContext: input.triggerContext,
    workflow: input.workflow,
  });
  env = {
    ...env,
    ...resolveEnvLayer(input.workflow.env, context),
  };
  context = {
    ...context,
    env,
  };
  env = {
    ...env,
    ...resolveEnvLayer(input.jobEnv, context),
  };
  context = {
    ...context,
    env,
  };
  env = {
    ...env,
    ...resolveEnvLayer(input.stepEnv, context),
    ...(input.execution.secrets || {}),
  };
  return env;
}

function validateDispatchInputs(workflow: GitForgeWorkflow, provided: Record<string, boolean | string> | undefined) {
  const inputs = workflow.on?.workflow_dispatch?.inputs || [];
  const next: Record<string, boolean | string> = {};
  for (const input of inputs) {
    const value = provided?.[input.name];
    if (value === undefined || value === null || value === "") {
      if (input.default !== undefined) {
        next[input.name] = input.default;
        continue;
      }
      if (input.required) {
        throw new GitHostError("forge_invalid_workflow_definition", `Manual workflow input "${input.name}" is required.`, {
          input: input.name,
          workflowId: workflow.id,
        });
      }
      continue;
    }
    if (input.type === "boolean") {
      if (typeof value === "boolean") {
        next[input.name] = value;
        continue;
      }
      if (value === "true" || value === "false") {
        next[input.name] = value === "true";
        continue;
      }
      throw new GitHostError("forge_invalid_workflow_definition", `Manual workflow input "${input.name}" must be a boolean.`, {
        input: input.name,
        value,
      });
    }
    next[input.name] = String(value);
  }
  return next;
}

function warnForUnsafeRunnerOptions(options: CreateGitForgeActionsOptions | undefined, runner: ReturnType<typeof normalizeRunner>) {
  if (options?.environment?.inheritProcessEnv) {
    console.warn(
      "[git-host] actions.environment.inheritProcessEnv is enabled: the entire host process environment is exposed to every workflow step and is not redacted. Only enable this for fully trusted workflows.",
    );
  }
  if (runnerNeedsPrivilegeWarning({
    localRunner: options?.localRunner,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
  })) {
    console.warn(
      "[git-host] the local Actions runner is executing as root with no actions.localRunner.uid drop or beforeSpawn sandbox: workflow steps run as root on the host. Configure a uid/gid drop or a sandbox (see createBubblewrapSandbox), or only run trusted workflows.",
    );
  }
}

export {
  ACTIVITY_LISTENER_SYMBOL,
  ACTIVITY_WRAPPED_SYMBOL,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  aggregateJobStatus,
  buildExpressionContext,
  ensureActionsStorage,
  isTerminalJobStatus,
  isTerminalRunStatus,
  mergeRuntimeEnv,
  normalizeRunner,
  normalizeTriggerContext,
  nowIso,
  resolveGithubRef,
  validateDispatchInputs,
  warnForUnsafeRunnerOptions,
};
export type {
  ActiveRunState,
  CreateGitForgeActionsRuntimeOptions,
  ResolvedExecutionContext,
  WorkflowQueueItem,
  WorkflowRunListener,
};
