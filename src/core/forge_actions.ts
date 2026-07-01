import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeActionsOptions,
  CreateGitForgeOptions,
  GitForgeActivityEntry,
  GitForgeActor,
  GitForgeActionsStorage,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunArtifact,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunJobStatus,
  GitForgeWorkflowRunStatus,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepFilters,
  GitForgeWorkflowRunStepStatus,
  GitForgeWorkflowTriggerKind,
  MaybePromise,
  RunGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { uploadArtifact, downloadArtifact } from "./actions/artifacts.js";
import { buildStepBaseEnv, runnerNeedsPrivilegeWarning } from "./actions/environment.js";
import { resolveWorkflowBoolean, resolveWorkflowString, type WorkflowExpressionContext } from "./actions/expressions.js";
import { materializeJobWorkspace, runShellCommand, setupRuntime } from "./actions/local_runner.js";
import { normalizeEnv } from "./actions/normalize.js";
import { assertAcyclicWorkflow, planWorkflowJobs, resolveRefName, type PlannedWorkflowJobInstance } from "./actions/planner.js";
import { createRunRedactor } from "./actions/redaction.js";
import { publishReleaseAsset } from "./actions/release_assets.js";
import { resolveActionsWorkspaceRoot, resolveReleaseAssetsRoot } from "./actions/workspace.js";
import { listRepositoryWorkflows, matchesWorkflowTrigger, readRepositoryWorkflow, resolveRepositoryWorkflowRoot } from "./actions/workflows.js";
import { runGit } from "./run_git.js";

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
  gitHost: CreateGitForgeOptions["gitHost"];
  releases: CreateGitForgeOptions["storage"]["releases"];
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

function createGitForgeActionsRuntime(options: CreateGitForgeActionsRuntimeOptions) {
  const storage = ensureActionsStorage(options.storage);
  const runListeners = new Map<string, Set<WorkflowRunListener>>();
  const runSequences = new Map<string, number>();
  const runExecutionContexts = new Map<string, ResolvedExecutionContext>();
  const queuedRuns: WorkflowQueueItem[] = [];
  const activeRuns = new Map<string, ActiveRunState>();
  const runner = normalizeRunner(options.actions);
  let processing = false;

  if (options.actions?.environment?.inheritProcessEnv) {
    console.warn(
      "[git-host] actions.environment.inheritProcessEnv is enabled: the entire host process environment is exposed to every workflow step and is not redacted. Only enable this for fully trusted workflows.",
    );
  }
  if (runnerNeedsPrivilegeWarning({
    localRunner: options.actions?.localRunner,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
  })) {
    console.warn(
      "[git-host] the local Actions runner is executing as root with no actions.localRunner.uid drop or beforeSpawn sandbox: workflow steps run as root on the host. Configure a uid/gid drop or a sandbox (see createBubblewrapSandbox), or only run trusted workflows.",
    );
  }

  async function nextRunSequence(runId: string): Promise<number> {
    const current = runSequences.get(runId);
    if (Number.isFinite(current)) {
      const next = Number(current) + 1;
      runSequences.set(runId, next);
      return next;
    }
    const existing = await storage.listWorkflowRunEvents(runId);
    const next = existing.length + 1;
    runSequences.set(runId, next);
    return next;
  }

  async function emitRunEvent(
    run: GitForgeWorkflowRun,
    input: Omit<GitForgeWorkflowRunEvent, "created_at" | "id" | "repository_id" | "run_id" | "sequence" | "workflow_id">,
  ) {
    const event = await storage.appendWorkflowRunEvent({
      ...input,
      created_at: nowIso(),
      id: randomUUID(),
      repository_id: run.repository_id,
      run_id: run.id,
      sequence: await nextRunSequence(run.id),
      workflow_id: run.workflow_id,
    });
    const listeners = Array.from(runListeners.get(run.id) || []);
    await Promise.all(listeners.map(async (listener) => {
      try {
        await listener(event);
      } catch {}
    }));
    return event;
  }

  async function readRepositoryPath(repositoryId: string) {
    const summary = await options.gitHost.readSummary(repositoryId);
    return summary.repository.path;
  }

  async function resolveCommit(repositoryPath: string, refInput: string) {
    const ref = text(refInput, "HEAD");
    const res = await runGit(["rev-parse", ref], { cwd: repositoryPath });
    if (!res.ok) {
      throw new GitHostError("git_command_failed", text(res.stderr, `Failed to resolve ref "${ref}".`), {
        ref,
        repositoryPath,
      });
    }
    return text(res.stdout);
  }

  async function resolveRunTarget(repositoryId: string, input: {
    branch?: string;
    commitHash?: string;
    ref?: string;
  }) {
    const summary = await options.gitHost.readSummary(repositoryId);
    const repositoryPath = summary.repository.path;
    const branch = text(input.branch, summary.repository.current_branch) || null;
    const ref = text(input.ref, branch || "HEAD");
    const commitHash = text(input.commitHash) || await resolveCommit(repositoryPath, ref);
    return {
      branch,
      commitHash,
      ref,
      repositoryPath,
    };
  }

  async function readRequiredRun(repositoryId: string, runId: string) {
    const run = await storage.readWorkflowRun(repositoryId, runId);
    if (!run) {
      throw new GitHostError("forge_resource_not_found", `Workflow run "${runId}" was not found.`, {
        repositoryId,
        runId,
      });
    }
    return run;
  }

  async function updateRun(repositoryId: string, runId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRun"]>[2]) {
    const run = await storage.updateWorkflowRun(repositoryId, runId, input);
    if (!run) {
      throw new GitHostError("forge_resource_not_found", `Workflow run "${runId}" was not found.`, {
        repositoryId,
        runId,
      });
    }
    return run;
  }

  async function updateJob(runId: string, jobRunId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunJob"]>[2]) {
    const job = await storage.updateWorkflowRunJob(runId, jobRunId, input);
    if (!job) {
      throw new GitHostError("forge_resource_not_found", `Workflow job run "${jobRunId}" was not found.`, {
        jobRunId,
        runId,
      });
    }
    return job;
  }

  async function updateStep(runId: string, stepId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunStep"]>[2]) {
    const step = await storage.updateWorkflowRunStep(runId, stepId, input);
    if (!step) {
      throw new GitHostError("forge_resource_not_found", `Workflow run step "${stepId}" was not found.`, {
        runId,
        stepId,
      });
    }
    return step;
  }

  async function readWorkflowAtRef(
    repositoryId: string,
    repositoryPath: string,
    ref: string | undefined,
    workflowId: string,
  ) {
    const workflowRoot = await resolveRepositoryWorkflowRoot(options.actions, repositoryId);
    return await readRepositoryWorkflow({
      ref,
      repositoryId,
      repositoryPath,
      workflowId,
      workflowRoot,
    });
  }

  async function resolveExecutionContext(
    repositoryId: string,
    workflow: GitForgeWorkflow,
    input: RunGitForgeWorkflowInput & {
      triggerContext: Record<string, unknown>;
      triggerKind: GitForgeWorkflowTriggerKind;
    },
  ): Promise<ResolvedExecutionContext> {
    const resolved = options.actions?.resolveExecutionContext
      ? await options.actions.resolveExecutionContext({
        actor: input.actor,
        repositoryId,
        runInput: input,
        triggerContext: input.triggerContext,
        triggerKind: input.triggerKind,
        workflow,
      })
      : null;
    const manualExecution = input.executionContext || {};
    return {
      ...(resolved?.actor || manualExecution.actor ? { actor: { ...(resolved?.actor || {}), ...(manualExecution.actor || {}) } } : {}),
      env: normalizeEnv({
        ...(resolved?.env || {}),
        ...(manualExecution.env || {}),
        ...(input.env || {}),
      }) || {},
      inputs: validateDispatchInputs(workflow, input.inputs),
      ...(resolved?.metadata || manualExecution.metadata ? { metadata: { ...(resolved?.metadata || {}), ...(manualExecution.metadata || {}) } } : {}),
      secrets: normalizeEnv({
        ...(resolved?.secrets || {}),
        ...(manualExecution.secrets || {}),
        ...(input.secrets || {}),
      }) || {},
    };
  }

  async function markQueuedStepsForJob(runId: string, jobRunId: string, status: Extract<GitForgeWorkflowRunStepStatus, "cancelled" | "skipped">) {
    const steps = await storage.listWorkflowRunSteps(runId, {
      jobRunId,
    });
    const now = nowIso();
    await Promise.all(steps
      .filter((step) => step.status === "queued")
      .map((step) => storage.updateWorkflowRunStep(runId, step.id, {
        finished_at: now,
        status,
      })));
  }

  async function markQueuedJobsAndSteps(runId: string, status: Extract<GitForgeWorkflowRunJobStatus, "cancelled" | "skipped">) {
    const jobs = await storage.listWorkflowRunJobs(runId);
    const now = nowIso();
    await Promise.all(jobs.map(async (job) => {
      if (job.status === "queued") {
        await storage.updateWorkflowRunJob(runId, job.id, {
          finished_at: now,
          status,
          summary: status === "cancelled" ? "Cancelled before starting." : "Skipped before starting.",
        });
      }
      await markQueuedStepsForJob(runId, job.id, status === "cancelled" ? "cancelled" : "skipped");
    }));
  }

  async function finalizeRun(run: GitForgeWorkflowRun, input: {
    eventType: GitForgeWorkflowRunEvent["type"];
    status: GitForgeWorkflowRunStatus;
    summary: string;
  }) {
    const finished = await updateRun(run.repository_id, run.id, {
      current_job: null,
      current_job_id: null,
      current_step: null,
      current_step_index: null,
      finished_at: nowIso(),
      status: input.status,
      summary: input.summary,
    });
    await emitRunEvent(finished, {
      status: input.status,
      summary: input.summary,
      type: input.eventType,
    });
    return finished;
  }

  async function resolveConcurrencyGroup(
    repositoryId: string,
    workflow: GitForgeWorkflow,
    input: RunGitForgeWorkflowInput & {
      triggerContext: Record<string, unknown>;
      triggerKind: GitForgeWorkflowTriggerKind;
    },
    runTarget: Awaited<ReturnType<typeof resolveRunTarget>>,
    execution: ResolvedExecutionContext,
  ) {
    if (!workflow.concurrency?.group) return null;
    const temporaryRun: GitForgeWorkflowRun = {
      branch: runTarget.branch,
      commit_hash: runTarget.commitHash,
      created_at: nowIso(),
      created_by: text(input.actor.id, "system"),
      current_step: null,
      current_step_index: null,
      finished_at: null,
      id: "pending",
      ref: runTarget.ref,
      repository_id: repositoryId,
      runner: null,
      started_at: null,
      status: "queued",
      summary: "",
      trigger_context: input.triggerContext,
      trigger_kind: input.triggerKind,
      workflow_id: workflow.id,
    };
    const context = buildExpressionContext({
      execution,
      run: temporaryRun,
      triggerContext: input.triggerContext,
      workflow,
    });
    return resolveWorkflowString(workflow.concurrency.group, context);
  }

  async function cancelConflictingRuns(repositoryId: string, runId: string, concurrencyGroup: string, actor: GitForgeActor) {
    const active = await storage.listWorkflowRuns(repositoryId, {
      status: ["queued", "running", "starting"],
    });
    for (const entry of active) {
      if (entry.id === runId) continue;
      if (text(entry.concurrency_group) !== text(concurrencyGroup)) continue;
      await runtime.cancelWorkflowRun(repositoryId, entry.id, actor);
    }
  }

  async function queueWorkflowRun(
    repositoryId: string,
    workflow: GitForgeWorkflow,
    input: RunGitForgeWorkflowInput & {
      triggerKind: GitForgeWorkflowTriggerKind;
    },
  ) {
    assertAcyclicWorkflow(workflow);
    const triggerContext = normalizeTriggerContext(input.triggerContext);
    const target = await resolveRunTarget(repositoryId, input);
    const createdAt = nowIso();
    const createdBy = text(input.actor.id, text(input.actor.name, "system"));
    const execution = await resolveExecutionContext(repositoryId, workflow, {
      ...input,
      triggerContext,
    });
    const concurrencyGroup = await resolveConcurrencyGroup(repositoryId, workflow, {
      ...input,
      triggerContext,
    }, target, execution);
    const run = await storage.createWorkflowRun({
      branch: target.branch,
      commit_hash: target.commitHash,
      ...(workflow.concurrency ? { concurrency_cancel_in_progress: workflow.concurrency.cancel_in_progress === true } : {}),
      ...(concurrencyGroup ? { concurrency_group: concurrencyGroup } : {}),
      created_at: createdAt,
      created_by: createdBy,
      current_job: null,
      current_job_id: null,
      current_step: null,
      current_step_index: null,
      execution_context: {
        ...(execution.actor ? { actor: execution.actor } : {}),
        env: execution.env,
        inputs: execution.inputs,
        ...(execution.metadata ? { metadata: execution.metadata } : {}),
        secret_names: Object.keys(execution.secrets),
      },
      finished_at: null,
      id: randomUUID(),
      ref: target.ref,
      release_id: text(triggerContext.release_id) || null,
      repository_id: repositoryId,
      runner: null,
      started_at: null,
      status: "queued",
      summary: "Workflow run queued.",
      trigger_context: {
        ...triggerContext,
        event_name: input.triggerKind === "manual" ? "workflow_dispatch" : input.triggerKind,
        inputs: execution.inputs,
        workflow_definition_path: workflow.definition_path,
      },
      trigger_kind: input.triggerKind,
      workflow_id: workflow.id,
    });
    const plannedJobs = planWorkflowJobs(workflow);
    for (const plannedJob of plannedJobs) {
      const jobRun = await storage.createWorkflowRunJob({
        current_step: null,
        current_step_index: null,
        finished_at: null,
        id: randomUUID(),
        index: plannedJob.index,
        job_id: plannedJob.job.id,
        ...(plannedJob.matrix ? { matrix: plannedJob.matrix } : {}),
        name: plannedJob.name,
        needs: plannedJob.job.needs,
        run_id: run.id,
        runner: null,
        runs_on: plannedJob.job.runs_on,
        started_at: null,
        status: "queued",
        summary: "Job queued.",
      });
      for (const [index, step] of plannedJob.job.steps.entries()) {
        await storage.createWorkflowRunStep({
          command: text(step.run, step.uses),
          exit_code: null,
          finished_at: null,
          id: randomUUID(),
          index,
          job_run_id: jobRun.id,
          kind: step.kind || (step.uses ? "uses" : "shell"),
          metadata: {
            env: step.env,
            if: step.if,
            shell: step.shell,
            with: step.with,
          },
          name: text(step.name, `Step ${index + 1}`),
          output_preview: "",
          run_id: run.id,
          started_at: null,
          status: "queued",
          uses: text(step.uses) || null,
        });
      }
    }

    await emitRunEvent(run, {
      metadata: {
        branch: run.branch,
        definition_path: workflow.definition_path,
        ref: run.ref,
      },
      status: "queued",
      summary: run.summary,
      type: "run.accepted",
    });
    runExecutionContexts.set(run.id, execution);

    if (run.concurrency_group && workflow.concurrency?.cancel_in_progress) {
      await cancelConflictingRuns(repositoryId, run.id, run.concurrency_group, input.actor);
    }

    queuedRuns.push({
      repositoryId,
      runId: run.id,
    });
    scheduleQueueProcessing();
    return run;
  }

  function scheduleQueueProcessing() {
    if (processing) return;
    queueMicrotask(() => {
      void processQueue();
    });
  }

  function supportedRunnerLabels() {
    return new Set(runner.labels || []);
  }

  function assertJobRunnerSupported(jobRun: GitForgeWorkflowRunJob) {
    const labels = supportedRunnerLabels();
    const unsupported = jobRun.runs_on.filter((entry) => !labels.has(text(entry)));
    if (unsupported.length) {
      throw new GitHostError("forge_actions_runner_failed", `Job "${jobRun.name}" requested unsupported runner labels: ${unsupported.join(", ")}.`, {
        jobRunId: jobRun.id,
        labels: unsupported,
      });
    }
  }

  async function emitJobStarted(run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob) {
    await emitRunEvent(run, {
      job_id: jobRun.job_id,
      job_name: jobRun.name,
      job_run_id: jobRun.id,
      status: "running",
      summary: `Running job ${jobRun.name}.`,
      type: "job.started",
    });
  }

  async function emitJobFinished(run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob) {
    await emitRunEvent(run, {
      job_id: jobRun.job_id,
      job_name: jobRun.name,
      job_run_id: jobRun.id,
      status: jobRun.status,
      summary: jobRun.summary,
      type: "job.finished",
    });
  }

  async function finishStep(
    run: GitForgeWorkflowRun,
    jobRun: GitForgeWorkflowRunJob,
    stepRun: GitForgeWorkflowRunStep,
    input: {
      exitCode?: number | null;
      outputPreview?: string;
      status: GitForgeWorkflowRunStepStatus;
      summary: string;
    },
  ) {
    const finished = await updateStep(run.id, stepRun.id, {
      exit_code: input.exitCode === undefined ? stepRun.exit_code : input.exitCode,
      finished_at: nowIso(),
      output_preview: text(input.outputPreview, stepRun.output_preview),
      status: input.status,
    });
    await emitRunEvent(run, {
      command: finished.command,
      job_id: jobRun.job_id,
      job_name: jobRun.name,
      job_run_id: jobRun.id,
      metadata: {
        exit_code: finished.exit_code,
      },
      status: finished.status,
      step_id: finished.id,
      step_index: finished.index,
      step_name: finished.name,
      summary: input.summary,
      type: "step.finished",
    });
    return finished;
  }

  async function skipJob(run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob, summary: string) {
    await markQueuedStepsForJob(run.id, jobRun.id, "skipped");
    const finished = await updateJob(run.id, jobRun.id, {
      finished_at: nowIso(),
      status: "skipped",
      summary,
    });
    await emitJobFinished(run, finished);
    return finished;
  }

  async function cancelJob(run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob, summary: string) {
    await markQueuedStepsForJob(run.id, jobRun.id, "cancelled");
    const finished = await updateJob(run.id, jobRun.id, {
      finished_at: nowIso(),
      status: "cancelled",
      summary,
    });
    await emitJobFinished(run, finished);
    return finished;
  }

  async function executePublishReleaseAssetStep(input: {
    jobRun: GitForgeWorkflowRunJob;
    run: GitForgeWorkflowRun;
    stepRun: GitForgeWorkflowRunStep;
    stepWith: Record<string, string>;
    workspacePath: string;
  }) {
    const assetName = text(input.stepWith.name);
    const pathSpec = text(input.stepWith.path);
    const format = text(input.stepWith.format, "tar.gz") === "zip" ? "zip" : "tar.gz";
    if (!assetName || !pathSpec) {
      throw new GitHostError("forge_actions_runner_failed", "actions/publish-release-asset requires with.name and with.path.", {
        uses: input.stepRun.uses,
      });
    }
    const tagName = text(input.stepWith.tag, resolveRefName(resolveGithubRef(input.run)));
    if (!tagName) {
      throw new GitHostError("forge_actions_runner_failed", "actions/publish-release-asset could not resolve a tag name; pass with.tag explicitly.", {
        uses: input.stepRun.uses,
      });
    }
    const { asset, release } = await publishReleaseAsset({
      assetName,
      format,
      releaseAssetsRoot: resolveReleaseAssetsRoot(options.actions),
      releaseId: text(input.run.release_id) || undefined,
      releases: options.releases,
      repositoryId: input.run.repository_id,
      sourcePath: path.resolve(input.workspacePath, pathSpec),
      tagName,
    });
    await emitRunEvent(input.run, {
      job_id: input.jobRun.job_id,
      job_name: input.jobRun.name,
      job_run_id: input.jobRun.id,
      metadata: {
        asset_id: asset.id,
        asset_name: asset.name,
        release_id: release.id,
        size: asset.size,
        tag_name: release.tag_name,
      },
      status: "success",
      step_id: input.stepRun.id,
      step_index: input.stepRun.index,
      step_name: input.stepRun.name,
      summary: `Published release asset ${asset.name}.`,
      type: "release_asset.published",
    });
    return {
      outputPreview: `Published release asset ${asset.name} to release ${release.tag_name}.\n`,
      summary: `Published release asset ${asset.name}.`,
    };
  }

  async function executeUsesStep(input: {
    artifactsRoot: string;
    execution: ResolvedExecutionContext;
    jobRun: GitForgeWorkflowRunJob;
    run: GitForgeWorkflowRun;
    stepWith: Record<string, string>;
    stepRun: GitForgeWorkflowRunStep;
    workspacePath: string;
  }) {
    const uses = text(input.stepRun.uses);
    if (uses === "actions/checkout" || uses === "actions/checkout@v4") {
      const targetRef = text(input.stepWith.ref);
      const targetPath = text(input.stepWith.path, ".");
      if (targetRef && targetRef !== input.run.ref && targetRef !== resolveGithubRef(input.run)) {
        throw new GitHostError("forge_actions_runner_failed", "actions/checkout only supports the workflow snapshot ref in v1.", {
          requestedRef: targetRef,
          runRef: input.run.ref,
        });
      }
      if (targetPath && targetPath !== ".") {
        throw new GitHostError("forge_actions_runner_failed", "actions/checkout path overrides are not supported in v1.", {
          path: targetPath,
        });
      }
      return {
        outputPreview: "Checked out workflow snapshot.\n",
        summary: "Checked out workflow snapshot.",
      };
    }
    if (uses === "actions/setup-node" || uses === "actions/setup-node@v4") {
      const version = await setupRuntime("node", input.workspacePath);
      return {
        outputPreview: text(version.stdout, version.stderr),
        summary: "Node runtime is available.",
      };
    }
    if (uses === "oven-sh/setup-bun" || uses === "oven-sh/setup-bun@v2") {
      const version = await setupRuntime("bun", input.workspacePath);
      return {
        outputPreview: text(version.stdout, version.stderr),
        summary: "Bun runtime is available.",
      };
    }
    if (uses === "actions/upload-artifact" || uses === "actions/upload-artifact@v4") {
      const artifactName = text(input.stepWith.name);
      const pathSpec = text(input.stepWith.path);
      if (!artifactName || !pathSpec) {
        throw new GitHostError("forge_actions_runner_failed", "actions/upload-artifact requires with.name and with.path.", {
          uses,
        });
      }
      const stored = uploadArtifact({
        artifactName,
        artifactsRoot: input.artifactsRoot,
        pathSpec,
        workspacePath: input.workspacePath,
      });
      const artifact = await storage.createWorkflowRunArtifact({
        created_at: nowIso(),
        file_count: stored.fileCount,
        id: randomUUID(),
        job_run_id: input.jobRun.id,
        name: artifactName,
        path: stored.path,
        repository_id: input.run.repository_id,
        run_id: input.run.id,
        size: stored.size,
        step_id: input.stepRun.id,
      });
      await emitRunEvent(input.run, {
        artifact_id: artifact.id,
        artifact_name: artifact.name,
        job_id: input.jobRun.job_id,
        job_name: input.jobRun.name,
        job_run_id: input.jobRun.id,
        metadata: {
          file_count: artifact.file_count,
          size: artifact.size,
        },
        status: "success",
        step_id: input.stepRun.id,
        step_index: input.stepRun.index,
        step_name: input.stepRun.name,
        summary: `Uploaded artifact ${artifact.name}.`,
        type: "artifact.uploaded",
      });
      return {
        outputPreview: `Uploaded artifact ${artifactName} (${stored.fileCount} files).\n`,
        summary: `Uploaded artifact ${artifactName}.`,
      };
    }
    if (uses === "actions/download-artifact" || uses === "actions/download-artifact@v4") {
      const artifactName = text(input.stepWith.name);
      if (!artifactName) {
        throw new GitHostError("forge_actions_runner_failed", "actions/download-artifact requires with.name.", {
          uses,
        });
      }
      const artifacts = await storage.listWorkflowRunArtifacts(input.run.id, {
        name: artifactName,
      });
      const artifact = artifacts[0];
      if (!artifact) {
        throw new GitHostError("forge_actions_runner_failed", `Artifact "${artifactName}" was not found for this run.`, {
          artifactName,
          runId: input.run.id,
        });
      }
      downloadArtifact({
        artifact,
        artifactsRoot: input.artifactsRoot,
        destinationPath: text(input.stepWith.path, "."),
        workspacePath: input.workspacePath,
      });
      await emitRunEvent(input.run, {
        artifact_id: artifact.id,
        artifact_name: artifact.name,
        job_id: input.jobRun.job_id,
        job_name: input.jobRun.name,
        job_run_id: input.jobRun.id,
        status: "success",
        step_id: input.stepRun.id,
        step_index: input.stepRun.index,
        step_name: input.stepRun.name,
        summary: `Downloaded artifact ${artifact.name}.`,
        type: "artifact.downloaded",
      });
      return {
        outputPreview: `Downloaded artifact ${artifactName}.\n`,
        summary: `Downloaded artifact ${artifactName}.`,
      };
    }
    if (uses === "actions/publish-release-asset" || uses === "actions/publish-release-asset@v1") {
      return await executePublishReleaseAssetStep(input);
    }
    throw new GitHostError("forge_actions_runner_failed", `Unsupported action "${uses}".`, {
      uses,
    });
  }

  async function executeJob(input: {
    activeState: ActiveRunState;
    artifactsRoot: string;
    execution: ResolvedExecutionContext;
    jobRun: GitForgeWorkflowRunJob;
    needs: Record<string, { result: GitForgeWorkflowRunJobStatus }>;
    repositoryPath: string;
    run: GitForgeWorkflowRun;
    workflow: GitForgeWorkflow;
  }) {
    const workflowJob = input.workflow.jobs.find((entry) => entry.id === input.jobRun.job_id);
    if (!workflowJob) {
      throw new GitHostError("forge_invalid_workflow_definition", `Workflow job "${input.jobRun.job_id}" no longer exists.`, {
        jobId: input.jobRun.job_id,
        workflowId: input.workflow.id,
      });
    }
    const baseContext = buildExpressionContext({
      execution: input.execution,
      ...(input.jobRun.matrix ? { matrix: input.jobRun.matrix } : {}),
      needs: input.needs,
      run: input.run,
      triggerContext: normalizeTriggerContext(input.run.trigger_context),
      workflow: input.workflow,
    });
    const dependencyStatus = Object.values(input.needs).map((entry) => entry.result);
    if (!workflowJob.if && dependencyStatus.some((status) => status !== "success")) {
      return await skipJob(input.run, input.jobRun, "Skipped because a dependency did not complete successfully.");
    }
    if (workflowJob.if && !resolveWorkflowBoolean(workflowJob.if, baseContext, true)) {
      return await skipJob(input.run, input.jobRun, `Skipped by if condition for job ${input.jobRun.name}.`);
    }
    if (input.activeState.cancelRequested) {
      return await cancelJob(input.run, input.jobRun, "Cancelled before job start.");
    }
    try {
      assertJobRunnerSupported(input.jobRun);
    } catch (error) {
      await markQueuedStepsForJob(input.run.id, input.jobRun.id, "skipped");
      const failedJob = await updateJob(input.run.id, input.jobRun.id, {
        finished_at: nowIso(),
        status: "failed",
        summary: error instanceof Error ? error.message : `Job ${input.jobRun.name} failed before start.`,
      });
      await emitJobFinished(input.run, failedJob);
      return failedJob;
    }

    const workspaceRoot = resolveActionsWorkspaceRoot(options.actions, input.run.repository_id, input.run.id);
    const workspacePath = path.join(workspaceRoot, "jobs", input.jobRun.id, "workspace");
    await materializeJobWorkspace({
      commitHash: input.run.commit_hash,
      repositoryPath: input.repositoryPath,
      workspacePath,
    });

    let jobRun = await updateJob(input.run.id, input.jobRun.id, {
      runner,
      started_at: nowIso(),
      status: "running",
      summary: `Running job ${input.jobRun.name}.`,
    });
    await updateRun(input.run.repository_id, input.run.id, {
      current_job: jobRun.name,
      current_job_id: jobRun.id,
      status: "running",
      summary: `Running job ${jobRun.name}.`,
    });
    await emitJobStarted(input.run, jobRun);

    const stepRuns = await storage.listWorkflowRunSteps(input.run.id, {
      jobRunId: jobRun.id,
    });
    for (const stepRun of stepRuns) {
      if (input.activeState.cancelRequested) {
        await finishStep(input.run, jobRun, stepRun, {
          status: "cancelled",
          summary: `Cancelled before step ${stepRun.name}.`,
        });
        continue;
      }

      const stepContext = {
        ...baseContext,
        env: mergeRuntimeEnv({
          actions: options.actions,
          execution: input.execution,
          jobEnv: workflowJob.env,
          ...(input.jobRun.matrix ? { matrix: input.jobRun.matrix } : {}),
          run: input.run,
          stepEnv: normalizeEnv(stepRun.metadata?.env),
          triggerContext: normalizeTriggerContext(input.run.trigger_context),
          workflow: input.workflow,
        }),
        job: {
          status: jobRun.status,
        },
      } satisfies WorkflowExpressionContext;
      const stepIf = text(stepRun.metadata?.if);
      if (stepIf && !resolveWorkflowBoolean(stepIf, stepContext, true)) {
        await finishStep(input.run, jobRun, stepRun, {
          status: "skipped",
          summary: `Skipped step ${stepRun.name}.`,
        });
        continue;
      }
      const redactor = createRunRedactor({
        actions: options.actions,
        env: stepContext.env,
        run: input.run,
        secrets: input.execution.secrets,
        step: stepRun,
      });
      const resolvedCommand = stepRun.kind === "shell"
        ? resolveWorkflowString(stepRun.command, stepContext)
        : resolveWorkflowString(text(stepRun.uses), stepContext);
      const startedStep = await updateStep(input.run.id, stepRun.id, {
        started_at: nowIso(),
        status: "running",
      });
      jobRun = await updateJob(input.run.id, jobRun.id, {
        current_step: startedStep.name,
        current_step_index: startedStep.index,
      });
      await updateRun(input.run.repository_id, input.run.id, {
        current_job: jobRun.name,
        current_job_id: jobRun.id,
        current_step: startedStep.name,
        current_step_index: startedStep.index,
        status: "running",
        summary: `Running ${jobRun.name} / ${startedStep.name}.`,
      });
      await emitRunEvent(input.run, {
        command: await redactor(resolvedCommand),
        job_id: jobRun.job_id,
        job_name: jobRun.name,
        job_run_id: jobRun.id,
        status: "running",
        step_id: startedStep.id,
        step_index: startedStep.index,
        step_name: startedStep.name,
        type: "step.started",
      });

      if (startedStep.kind === "uses") {
        const resolvedWith = Object.fromEntries(
          Object.entries((startedStep.metadata?.with && typeof startedStep.metadata.with === "object")
            ? startedStep.metadata.with as Record<string, unknown>
            : {})
            .map(([key, value]) => [key, resolveWorkflowString(String(value), stepContext)] as const),
        );
        try {
          const result = await executeUsesStep({
            artifactsRoot: input.artifactsRoot,
            execution: input.execution,
            jobRun,
            run: input.run,
            stepWith: resolvedWith,
            stepRun: startedStep,
            workspacePath,
          });
          const preview = await redactor(result.outputPreview || "");
          if (preview) {
            await emitRunEvent(input.run, {
              chunk: preview,
              job_id: jobRun.job_id,
              job_name: jobRun.name,
              job_run_id: jobRun.id,
              status: "running",
              step_id: startedStep.id,
              step_index: startedStep.index,
              step_name: startedStep.name,
              stream: "stdout",
              type: "step.output",
            });
            await emitRunEvent(input.run, {
              chunk: preview,
              job_id: jobRun.job_id,
              job_name: jobRun.name,
              job_run_id: jobRun.id,
              status: "running",
              step_id: startedStep.id,
              step_index: startedStep.index,
              step_name: startedStep.name,
              stream: "stdout",
              type: "job.output",
            });
          }
          await finishStep(input.run, jobRun, startedStep, {
            outputPreview: preview,
            status: "success",
            summary: result.summary,
          });
          continue;
        } catch (error) {
          const summary = await redactor(error instanceof Error ? error.message : "Action step failed.");
          await finishStep(input.run, jobRun, startedStep, {
            outputPreview: summary,
            status: input.activeState.cancelRequested ? "cancelled" : "failed",
            summary,
          });
          await markQueuedStepsForJob(input.run.id, jobRun.id, input.activeState.cancelRequested ? "cancelled" : "skipped");
          jobRun = await updateJob(input.run.id, jobRun.id, {
            current_step: null,
            current_step_index: null,
            finished_at: nowIso(),
            status: input.activeState.cancelRequested ? "cancelled" : "failed",
            summary,
          });
          await emitJobFinished(input.run, jobRun);
          return jobRun;
        }
      }

      const shell = text(startedStep.metadata?.shell, text(options.actions?.shell, "bash"));
      const runtimeEnv = mergeRuntimeEnv({
        actions: options.actions,
        execution: input.execution,
        jobEnv: workflowJob.env,
        ...(input.jobRun.matrix ? { matrix: input.jobRun.matrix } : {}),
        run: input.run,
        stepEnv: normalizeEnv(startedStep.metadata?.env),
        triggerContext: normalizeTriggerContext(input.run.trigger_context),
        workflow: input.workflow,
      });
      const result = await runShellCommand({
        ...(options.actions?.localRunner?.beforeSpawn ? { beforeSpawn: options.actions.localRunner.beforeSpawn } : {}),
        command: resolvedCommand,
        cwd: workspacePath,
        env: runtimeEnv,
        ...(options.actions?.localRunner?.execTimeoutMs === undefined ? {} : { execTimeoutMs: options.actions.localRunner.execTimeoutMs }),
        ...(options.actions?.localRunner?.gid === undefined ? {} : { gid: options.actions.localRunner.gid }),
        heartbeatIntervalMs: Math.max(250, Number(options.actions?.heartbeatIntervalMs) || DEFAULT_HEARTBEAT_INTERVAL_MS),
        ...(options.actions?.localRunner?.uid === undefined ? {} : { uid: options.actions.localRunner.uid }),
        onHeartbeat: async () => {
          await emitRunEvent(input.run, {
            job_id: jobRun.job_id,
            job_name: jobRun.name,
            job_run_id: jobRun.id,
            status: "running",
            step_id: startedStep.id,
            step_index: startedStep.index,
            step_name: startedStep.name,
            type: "step.heartbeat",
          });
          await emitRunEvent(input.run, {
            job_id: jobRun.job_id,
            job_name: jobRun.name,
            job_run_id: jobRun.id,
            status: "running",
            step_id: startedStep.id,
            step_index: startedStep.index,
            step_name: startedStep.name,
            type: "job.heartbeat",
          });
        },
        onOutput: async (stream, chunk) => {
          const redacted = await redactor(chunk, stream);
          await emitRunEvent(input.run, {
            chunk: redacted,
            job_id: jobRun.job_id,
            job_name: jobRun.name,
            job_run_id: jobRun.id,
            status: "running",
            step_id: startedStep.id,
            step_index: startedStep.index,
            step_name: startedStep.name,
            stream,
            type: "step.output",
          });
          await emitRunEvent(input.run, {
            chunk: redacted,
            job_id: jobRun.job_id,
            job_name: jobRun.name,
            job_run_id: jobRun.id,
            status: "running",
            step_id: startedStep.id,
            step_index: startedStep.index,
            step_name: startedStep.name,
            stream,
            type: "job.output",
          });
        },
        onSpawn: (child) => {
          input.activeState.child = child;
        },
        shell: shell || "bash",
      });
      const redactedPreview = await redactor(result.outputPreview);
      if (input.activeState.cancelRequested || result.exitCode === 130) {
        await finishStep(input.run, jobRun, startedStep, {
          exitCode: result.exitCode,
          outputPreview: redactedPreview,
          status: "cancelled",
          summary: `Cancelled during step ${startedStep.name}.`,
        });
        await markQueuedStepsForJob(input.run.id, jobRun.id, "cancelled");
        jobRun = await updateJob(input.run.id, jobRun.id, {
          current_step: null,
          current_step_index: null,
          finished_at: nowIso(),
          status: "cancelled",
          summary: `Cancelled during job ${jobRun.name}.`,
        });
        await emitJobFinished(input.run, jobRun);
        return jobRun;
      }
      if (result.exitCode !== 0) {
        await finishStep(input.run, jobRun, startedStep, {
          exitCode: result.exitCode,
          outputPreview: redactedPreview,
          status: "failed",
          summary: `Failed step ${startedStep.name}.`,
        });
        await markQueuedStepsForJob(input.run.id, jobRun.id, "skipped");
        jobRun = await updateJob(input.run.id, jobRun.id, {
          current_step: null,
          current_step_index: null,
          finished_at: nowIso(),
          status: "failed",
          summary: `Job ${jobRun.name} failed in step ${startedStep.name}.`,
        });
        await emitJobFinished(input.run, jobRun);
        return jobRun;
      }
      await finishStep(input.run, jobRun, startedStep, {
        exitCode: result.exitCode,
        outputPreview: redactedPreview,
        status: "success",
        summary: `Completed step ${startedStep.name}.`,
      });
    }

    jobRun = await updateJob(input.run.id, jobRun.id, {
      current_step: null,
      current_step_index: null,
      finished_at: nowIso(),
      status: "success",
      summary: `Job ${jobRun.name} completed successfully.`,
    });
    await emitJobFinished(input.run, jobRun);
    return jobRun;
  }

  async function executeRun(repositoryId: string, runId: string) {
    let run = await readRequiredRun(repositoryId, runId);
    if (isTerminalRunStatus(run.status)) return run;
    run = await updateRun(repositoryId, runId, {
      runner,
      started_at: nowIso(),
      status: "starting",
      summary: "Preparing workflow run.",
    });
    await emitRunEvent(run, {
      metadata: {
        runner,
      },
      status: "starting",
      summary: run.summary,
      type: "run.status",
    });

    const repositoryPath = await readRepositoryPath(repositoryId);
    const workflow = await readWorkflowAtRef(repositoryId, repositoryPath, run.ref, run.workflow_id);
    const execution = runExecutionContexts.get(run.id) || {
      actor: (run.execution_context?.actor && typeof run.execution_context.actor === "object") ? run.execution_context.actor as Record<string, unknown> : undefined,
      env: normalizeEnv(run.execution_context?.env) || {},
      inputs: (run.trigger_context?.inputs && typeof run.trigger_context.inputs === "object")
        ? run.trigger_context.inputs as Record<string, boolean | string>
        : {},
      metadata: (run.execution_context?.metadata && typeof run.execution_context.metadata === "object") ? run.execution_context.metadata as Record<string, unknown> : undefined,
      secrets: {},
    } satisfies ResolvedExecutionContext;
    const activeState: ActiveRunState = {
      cancelRequested: false,
      child: null,
    };
    activeRuns.set(run.id, activeState);

    try {
      const artifactsRoot = path.join(resolveActionsWorkspaceRoot(options.actions, run.repository_id, run.id), "artifacts");
      const allJobs = await storage.listWorkflowRunJobs(run.id);
      const pendingJobs = Array.from(allJobs).sort((left, right) => left.index - right.index);
      const completedByJobId = new Map<string, GitForgeWorkflowRunJob[]>();

      while (pendingJobs.length) {
        if (activeState.cancelRequested) {
          await markQueuedJobsAndSteps(run.id, "cancelled");
          return await finalizeRun(run, {
            eventType: "run.cancelled",
            status: "cancelled",
            summary: "Workflow run cancelled.",
          });
        }
        const nextIndex = pendingJobs.findIndex((job) => (
          (job.needs || []).every((need) => {
            const results = completedByJobId.get(need) || [];
            const expected = allJobs.filter((entry) => entry.job_id === need).length;
            return results.length === expected && results.every((entry) => isTerminalJobStatus(entry.status));
          })
        ));
        if (nextIndex < 0) {
          throw new GitHostError("forge_invalid_workflow_definition", `Workflow "${workflow.id}" has no runnable job order.`, {
            workflowId: workflow.id,
          });
        }
        const nextJob = pendingJobs.splice(nextIndex, 1)[0]!;
        const needs = Object.fromEntries((nextJob.needs || []).map((need) => {
          const statuses = (completedByJobId.get(need) || []).map((entry) => entry.status);
          return [need, { result: aggregateJobStatus(statuses) }] as const;
        }));
        const finishedJob = await executeJob({
          activeState,
          artifactsRoot,
          execution,
          jobRun: nextJob,
          needs,
          repositoryPath,
          run,
          workflow,
        });
        const existing = completedByJobId.get(finishedJob.job_id) || [];
        existing.push(finishedJob);
        completedByJobId.set(finishedJob.job_id, existing);
      }

      const jobs = await storage.listWorkflowRunJobs(run.id);
      if (jobs.some((job) => job.status === "failed")) {
        const failedJob = jobs.find((job) => job.status === "failed");
        await markQueuedJobsAndSteps(run.id, "skipped");
        return await finalizeRun(run, {
          eventType: "run.failed",
          status: "failed",
          summary: text(failedJob?.summary, "Workflow run failed."),
        });
      }
      if (jobs.some((job) => job.status === "cancelled")) {
        await markQueuedJobsAndSteps(run.id, "cancelled");
        return await finalizeRun(run, {
          eventType: "run.cancelled",
          status: "cancelled",
          summary: "Workflow run cancelled.",
        });
      }
      if (jobs.every((job) => job.status === "skipped")) {
        return await finalizeRun(run, {
          eventType: "run.finished",
          status: "skipped",
          summary: "Workflow run was skipped.",
        });
      }
      return await finalizeRun(run, {
        eventType: "run.finished",
        status: "success",
        summary: "Workflow run completed successfully.",
      });
    } catch (error) {
      await markQueuedJobsAndSteps(run.id, activeState.cancelRequested ? "cancelled" : "skipped");
      return await finalizeRun(run, {
        eventType: activeState.cancelRequested ? "run.cancelled" : "run.failed",
        status: activeState.cancelRequested ? "cancelled" : "failed",
        summary: activeState.cancelRequested
          ? "Workflow run cancelled."
          : (error instanceof Error ? error.message : "Workflow run failed."),
      });
    } finally {
      if (activeState.child && !activeState.child.killed) {
        try { activeState.child.kill("SIGKILL"); } catch {}
      }
      activeRuns.delete(run.id);
      runExecutionContexts.delete(run.id);
    }
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      while (queuedRuns.length) {
        const next = queuedRuns.shift();
        if (!next) continue;
        const run = await storage.readWorkflowRun(next.repositoryId, next.runId);
        if (!run || isTerminalRunStatus(run.status)) continue;
        await executeRun(next.repositoryId, next.runId);
      }
    } finally {
      processing = false;
    }
  }

  async function enqueueWorkflowsForTrigger(
    repositoryId: string,
    triggerKind: GitForgeWorkflowTriggerKind,
    actor: GitForgeActor,
    context: Record<string, unknown>,
  ) {
    const target = await resolveRunTarget(repositoryId, {
      branch: text(context.branch),
      commitHash: text(context.commit_hash, text(context.head_commit)),
      ref: text(context.ref, text(context.tag_name, text(context.branch, "HEAD"))),
    });
    const workflowRoot = await resolveRepositoryWorkflowRoot(options.actions, repositoryId);
    const workflows = await listRepositoryWorkflows({
      filters: {
        enabled: true,
      } satisfies GitForgeWorkflowFilters,
      ref: target.ref,
      repositoryId,
      repositoryPath: target.repositoryPath,
      workflowRoot,
    });

    const createdRuns: GitForgeWorkflowRun[] = [];
    for (const workflow of workflows) {
      if (!matchesWorkflowTrigger(workflow, triggerKind, context)) continue;
      createdRuns.push(await queueWorkflowRun(repositoryId, workflow, {
        actor,
        branch: target.branch || undefined,
        commitHash: target.commitHash,
        ref: target.ref,
        triggerContext: context,
        triggerKind,
      }));
    }
    return createdRuns;
  }

  async function handleActivity(entry: GitForgeActivityEntry) {
    const actor: GitForgeActor = {
      id: text(entry.actor_id, text(entry.actor_label, "system")),
      name: text(entry.actor_label, entry.actor_id),
    };

    if (entry.kind === "repository.push") {
      await enqueueWorkflowsForTrigger(entry.repository_id, "push", actor, {
        ...(entry.metadata || {}),
        activity_id: entry.id,
      });
      return;
    }

    if (entry.kind === "release.create" || entry.kind === "release.update") {
      const releaseId = text(entry.metadata?.release_id);
      const release = releaseId ? await options.releases.readRelease(entry.repository_id, releaseId) : null;
      const targetRef = text(release?.target_ref);
      const repositoryPath = await readRepositoryPath(entry.repository_id);
      const commitHash = targetRef ? await resolveCommit(repositoryPath, targetRef) : "";
      await enqueueWorkflowsForTrigger(entry.repository_id, entry.kind as "release.create" | "release.update", actor, {
        ...(entry.metadata || {}),
        activity_id: entry.id,
        commit_hash: commitHash,
        ref: text(release?.tag_name, targetRef),
        release_id: release?.id,
        tag_name: text(release?.tag_name, text(entry.metadata?.tag_name)),
      });
    }
  }

  function bindActivityStorage(activityStorage: CreateGitForgeOptions["storage"]["activity"]) {
    const store = activityStorage as typeof activityStorage & {
      [ACTIVITY_LISTENER_SYMBOL]?: Set<(entry: GitForgeActivityEntry) => Promise<void>>;
      [ACTIVITY_WRAPPED_SYMBOL]?: boolean;
    };
    if (!store[ACTIVITY_LISTENER_SYMBOL]) {
      store[ACTIVITY_LISTENER_SYMBOL] = new Set();
    }
    store[ACTIVITY_LISTENER_SYMBOL]!.add(async (entry) => {
      await handleActivity(entry);
    });

    if (store[ACTIVITY_WRAPPED_SYMBOL]) return;
    store[ACTIVITY_WRAPPED_SYMBOL] = true;
    const original = activityStorage.createActivity.bind(activityStorage);
    activityStorage.createActivity = async (input) => {
      const entry = await original(input);
      const listeners = Array.from(store[ACTIVITY_LISTENER_SYMBOL] || []);
      await Promise.all(listeners.map(async (listener) => {
        try {
          await listener(entry);
        } catch {}
      }));
      return entry;
    };
  }

  const runtime = {
    bindActivityStorage,

    async listWorkflows(repositoryId: string, filters?: GitForgeWorkflowFilters) {
      const repositoryPath = await readRepositoryPath(repositoryId);
      const workflowRoot = await resolveRepositoryWorkflowRoot(options.actions, repositoryId);
      return await listRepositoryWorkflows({
        filters,
        repositoryId,
        repositoryPath,
        workflowRoot,
      });
    },

    async readWorkflow(repositoryId: string, workflowId: string) {
      const repositoryPath = await readRepositoryPath(repositoryId);
      return await readWorkflowAtRef(repositoryId, repositoryPath, undefined, workflowId);
    },

    async runWorkflow(repositoryId: string, workflowId: string, input: RunGitForgeWorkflowInput) {
      const target = await resolveRunTarget(repositoryId, input);
      const workflow = await readWorkflowAtRef(repositoryId, target.repositoryPath, target.ref, workflowId);
      if (!workflow.on?.workflow_dispatch && workflow.trigger !== "manual") {
        throw new GitHostError("forge_invalid_workflow_definition", `Workflow "${workflowId}" does not support manual dispatch.`, {
          workflowId,
        });
      }
      return await queueWorkflowRun(repositoryId, workflow, {
        ...input,
        branch: target.branch || undefined,
        commitHash: target.commitHash,
        ref: target.ref,
        triggerKind: "manual",
      });
    },

    async cancelWorkflowRun(repositoryId: string, runId: string, actor: GitForgeActor) {
      const run = await readRequiredRun(repositoryId, runId);
      if (isTerminalRunStatus(run.status)) return run;
      const active = activeRuns.get(run.id);

      await emitRunEvent(run, {
        metadata: {
          actor_id: actor.id,
        },
        status: "running",
        summary: `Cancellation requested by ${text(actor.id)}.`,
        type: "run.cancellation_requested",
      });

      if (active) {
        active.cancelRequested = true;
        if (active.child && !active.child.killed) {
          try { active.child.kill("SIGTERM"); } catch {}
        }
        return await updateRun(repositoryId, runId, {
          summary: `Cancellation requested by ${text(actor.id)}.`,
        });
      }

      await markQueuedJobsAndSteps(run.id, "cancelled");
      const cancelled = await updateRun(repositoryId, runId, {
        finished_at: nowIso(),
        status: "cancelled",
        summary: `Cancelled by ${text(actor.id)}.`,
      });
      await emitRunEvent(cancelled, {
        status: "cancelled",
        summary: cancelled.summary,
        type: "run.cancelled",
      });
      return cancelled;
    },

    async listWorkflowRuns(repositoryId: string, filters?: GitForgeWorkflowRunFilters) {
      return await storage.listWorkflowRuns(repositoryId, filters);
    },

    async readWorkflowRun(repositoryId: string, runId: string) {
      return await readRequiredRun(repositoryId, runId);
    },

    async listWorkflowRunJobs(repositoryId: string, runId: string, filters?: { jobId?: string; status?: GitForgeWorkflowRunJobStatus | GitForgeWorkflowRunJobStatus[] }) {
      await readRequiredRun(repositoryId, runId);
      return await storage.listWorkflowRunJobs(runId, filters);
    },

    async listWorkflowRunSteps(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunStepFilters) {
      await readRequiredRun(repositoryId, runId);
      return await storage.listWorkflowRunSteps(runId, filters);
    },

    async listWorkflowRunArtifacts(repositoryId: string, runId: string, filters?: { jobRunId?: string; name?: string }) {
      await readRequiredRun(repositoryId, runId);
      return await storage.listWorkflowRunArtifacts(runId, filters);
    },

    async listWorkflowRunEvents(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunEventFilters) {
      await readRequiredRun(repositoryId, runId);
      return await storage.listWorkflowRunEvents(runId, filters);
    },

    subscribeWorkflowRun(repositoryId: string, runId: string, listener: WorkflowRunListener) {
      void repositoryId;
      let listeners = runListeners.get(runId);
      if (!listeners) {
        listeners = new Set();
        runListeners.set(runId, listeners);
      }
      listeners.add(listener);
      return {
        close() {
          listeners?.delete(listener);
          if (listeners && listeners.size === 0) {
            runListeners.delete(runId);
          }
        },
      };
    },
  };

  return runtime;
}

export { createGitForgeActionsRuntime, isTerminalRunStatus };
