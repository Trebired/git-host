import { randomUUID } from "node:crypto";

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
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunStatus,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepStatus,
  GitForgeWorkflowTriggerKind,
  MaybePromise,
  RunGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { executeActionsRunner, resolveActionsWorkspaceRoot } from "./actions/runner.js";
import { listRepositoryWorkflows, readRepositoryWorkflow, resolveRepositoryWorkflowRoot } from "./actions/workflows.js";
import { runGit } from "./run_git.js";

const ACTIVITY_LISTENER_SYMBOL = Symbol.for("@trebired/git-host/actions-activity-listeners");
const ACTIVITY_WRAPPED_SYMBOL = Symbol.for("@trebired/git-host/actions-activity-wrapped");
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000;
const TERMINAL_RUN_STATUSES = new Set<GitForgeWorkflowRunStatus>(["cancelled", "failed", "skipped", "success"]);

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
  child?: ReturnType<typeof executeActionsRunner>["child"];
};

function nowIso(): string {
  return new Date().toISOString();
}

function toDateSortValue(value: string | null | undefined): string {
  return text(value);
}

function matchesWorkflowTrigger(workflow: GitForgeWorkflow, triggerKind: GitForgeWorkflowTriggerKind, context: Record<string, unknown>) {
  if (!workflow.enabled || text(workflow.trigger) !== text(triggerKind)) return false;

  const branches = Array.isArray(workflow.source?.branches) ? workflow.source?.branches.map((entry) => text(entry)).filter(Boolean) : [];
  const tags = Array.isArray(workflow.source?.tags) ? workflow.source?.tags.map((entry) => text(entry)).filter(Boolean) : [];
  const branch = text(context.branch);
  const tag = text(context.tag_name, text(context.tag));

  if (branches.length && !branches.includes(branch)) return false;
  if (tags.length && !tags.includes(tag)) return false;
  return true;
}

function isTerminalRunStatus(status: GitForgeWorkflowRunStatus) {
  return TERMINAL_RUN_STATUSES.has(status);
}

function ensureActionsStorage(storage: GitForgeActionsStorage | undefined): GitForgeActionsStorage {
  if (!storage) {
    throw new GitHostError("forge_actions_not_configured", "Actions storage is required to use repository workflows.");
  }
  return storage;
}

function normalizeRunner(options: CreateGitForgeActionsOptions | undefined) {
  const runner = options?.runner || {};
  return {
    capabilities: Array.isArray(runner.capabilities) ? runner.capabilities.map((entry) => text(entry)).filter(Boolean) : ["go-runner", "shell", "snapshot", "streaming-logs"],
    host: text(runner.host, "local-host"),
    id: text(runner.id, "go-runner"),
    kind: text(runner.kind, "go-runner"),
    platform_version: text(runner.platform_version, "@trebired/git-host"),
  };
}

function createGitForgeActionsRuntime(options: CreateGitForgeActionsRuntimeOptions) {
  const storage = ensureActionsStorage(options.storage);
  const runListeners = new Map<string, Set<WorkflowRunListener>>();
  const runSequences = new Map<string, number>();
  const queuedRuns: WorkflowQueueItem[] = [];
  const activeRuns = new Map<string, ActiveRunState>();
  const runner = normalizeRunner(options.actions);
  let processing = false;

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

  async function updateRunStep(runId: string, stepId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunStep"]>[2]) {
    const step = await storage.updateWorkflowRunStep(runId, stepId, input);
    if (!step) {
      throw new GitHostError("forge_resource_not_found", `Workflow run step "${stepId}" was not found.`, {
        runId,
        stepId,
      });
    }
    return step;
  }

  function scheduleQueueProcessing() {
    if (processing) return;
    queueMicrotask(() => {
      void processQueue();
    });
  }

  async function markQueuedSteps(runId: string, fromIndex: number, status: Extract<GitForgeWorkflowRunStepStatus, "cancelled" | "skipped">) {
    const steps = await storage.listWorkflowRunSteps(runId);
    const now = nowIso();
    await Promise.all(steps
      .filter((step) => step.index > fromIndex && step.status === "queued")
      .map((step) => storage.updateWorkflowRunStep(runId, step.id, {
        finished_at: now,
        status,
      })));
  }

  async function finalizeRun(run: GitForgeWorkflowRun, input: {
    currentStep?: string | null;
    currentStepIndex?: number | null;
    eventType: GitForgeWorkflowRunEvent["type"];
    status: GitForgeWorkflowRunStatus;
    summary: string;
  }) {
    const finished = await updateRun(run.repository_id, run.id, {
      current_step: input.currentStep === undefined ? null : input.currentStep,
      current_step_index: input.currentStepIndex === undefined ? null : input.currentStepIndex,
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

  async function queueWorkflowRun(
    repositoryId: string,
    workflow: GitForgeWorkflow,
    input: RunGitForgeWorkflowInput & {
      triggerKind: GitForgeWorkflowTriggerKind;
      releaseId?: string | null;
    },
  ) {
    const target = await resolveRunTarget(repositoryId, input);
    const createdAt = nowIso();
    const createdBy = text(input.actor.id, text(input.actor.name, "system"));
    const run = await storage.createWorkflowRun({
      branch: target.branch,
      commit_hash: target.commitHash,
      created_at: createdAt,
      created_by: createdBy,
      current_step: null,
      current_step_index: null,
      finished_at: null,
      id: randomUUID(),
      ref: target.ref,
      release_id: input.releaseId == null ? null : text(input.releaseId),
      repository_id: repositoryId,
      runner: null,
      started_at: null,
      status: "queued",
      summary: "Workflow run queued.",
      trigger_context: {
        ...(input.triggerContext || {}),
        workflow_definition_path: workflow.definition_path,
      },
      trigger_kind: input.triggerKind,
      workflow_id: workflow.id,
    });

    await Promise.all(workflow.steps.map(async (step, index) => {
      await storage.createWorkflowRunStep({
        command: step.run,
        exit_code: null,
        finished_at: null,
        id: randomUUID(),
        index,
        kind: "shell",
        metadata: step.env ? { env: step.env, shell: text(step.shell) } : (text(step.shell) ? { shell: text(step.shell) } : undefined),
        name: text(step.name, `Step ${index + 1}`),
        output_preview: "",
        run_id: run.id,
        started_at: null,
        status: "queued",
      });
    }));

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
    queuedRuns.push({
      repositoryId,
      runId: run.id,
    });
    scheduleQueueProcessing();
    return run;
  }

  async function handleRunnerEvent(
    run: GitForgeWorkflowRun,
    stepsById: Map<string, GitForgeWorkflowRunStep>,
    event: {
      chunk?: string;
      command?: string;
      exit_code?: number;
      output_preview?: string;
      status?: GitForgeWorkflowRunStatus | GitForgeWorkflowRunStepStatus;
      step_id?: string;
      step_index?: number;
      step_name?: string;
      stream?: "stderr" | "stdout";
      summary?: string;
      type: "run.status" | "step.heartbeat" | "step.finished" | "step.output" | "step.started";
    },
  ) {
    if (event.type === "run.status") {
      const updatedRun = await updateRun(run.repository_id, run.id, {
        status: event.status as GitForgeWorkflowRun["status"],
        summary: text(event.summary, run.summary),
      });
      await emitRunEvent(updatedRun, {
        status: updatedRun.status,
        summary: updatedRun.summary,
        type: "run.status",
      });
      return updatedRun;
    }

    const step = event.step_id ? stepsById.get(event.step_id) : undefined;
    if (!step) return run;

    if (event.type === "step.started") {
      const startedStep = await updateRunStep(run.id, step.id, {
        started_at: nowIso(),
        status: "running",
      });
      stepsById.set(step.id, startedStep);
      const updatedRun = await updateRun(run.repository_id, run.id, {
        current_step: startedStep.name,
        current_step_index: startedStep.index,
        status: "running",
        summary: `Running ${startedStep.name}.`,
      });
      await emitRunEvent(updatedRun, {
        command: text(event.command, startedStep.command),
        status: "running",
        step_id: startedStep.id,
        step_index: startedStep.index,
        step_name: startedStep.name,
        type: "step.started",
      });
      return updatedRun;
    }

    if (event.type === "step.output") {
      let chunk = text(event.chunk);
      if (chunk && options.actions?.redactOutput) {
        chunk = await options.actions.redactOutput({
          chunk,
          run,
          step,
          stream: event.stream || "stdout",
        });
      }
      await emitRunEvent(run, {
        chunk,
        status: "running",
        step_id: step.id,
        step_index: step.index,
        step_name: step.name,
        stream: event.stream || "stdout",
        type: "step.output",
      });
      return run;
    }

    if (event.type === "step.heartbeat") {
      await emitRunEvent(run, {
        status: "running",
        step_id: step.id,
        step_index: step.index,
        step_name: step.name,
        type: "step.heartbeat",
      });
      return run;
    }

    const finishedStep = await updateRunStep(run.id, step.id, {
      exit_code: typeof event.exit_code === "number" ? event.exit_code : step.exit_code,
      finished_at: nowIso(),
      output_preview: text(event.output_preview, step.output_preview),
      status: (event.status as GitForgeWorkflowRunStepStatus | undefined) || step.status,
    });
    stepsById.set(step.id, finishedStep);
    await emitRunEvent(run, {
      command: finishedStep.command,
      metadata: {
        exit_code: finishedStep.exit_code,
      },
      status: finishedStep.status,
      step_id: finishedStep.id,
      step_index: finishedStep.index,
      step_name: finishedStep.name,
      summary: text(event.summary),
      type: "step.finished",
    });
    return run;
  }

  async function executeRun(repositoryId: string, runId: string) {
    let run = await readRequiredRun(repositoryId, runId);
    if (isTerminalRunStatus(run.status)) return run;

    run = await updateRun(repositoryId, runId, {
      runner,
      started_at: nowIso(),
      status: "starting",
      summary: "Preparing workflow workspace.",
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
    const steps = await storage.listWorkflowRunSteps(run.id);
    const stepsById = new Map(steps.map((step) => [step.id, step] as const));
    const activeState: ActiveRunState = {
      cancelRequested: false,
    };
    activeRuns.set(run.id, activeState);

    try {
      const execution = executeActionsRunner({
        actions: options.actions,
        heartbeatIntervalMs: Math.max(250, Number(options.actions?.heartbeatIntervalMs) || DEFAULT_HEARTBEAT_INTERVAL_MS),
        onEvent: async (event) => {
          run = await handleRunnerEvent(run, stepsById, event);
        },
        repositoryPath,
        run,
        steps,
        workspaceRoot: resolveActionsWorkspaceRoot(options.actions, run.repository_id, run.id),
      });
      activeState.child = execution.child;

      const result = await execution.completed;
      const persistedSteps = await storage.listWorkflowRunSteps(run.id);
      const failedStep = persistedSteps.find((step) => step.status === "failed");

      if (activeState.cancelRequested || result.cancelled) {
        await markQueuedSteps(run.id, result.lastStepIndex, "cancelled");
        return await finalizeRun(run, {
          currentStep: null,
          currentStepIndex: null,
          eventType: "run.cancelled",
          status: "cancelled",
          summary: "Workflow run cancelled.",
        });
      }

      if (failedStep || result.exitCode !== 0) {
        await markQueuedSteps(run.id, failedStep ? failedStep.index : result.lastStepIndex, "skipped");
        return await finalizeRun(run, {
          currentStep: null,
          currentStepIndex: null,
          eventType: "run.failed",
          status: "failed",
          summary: failedStep
            ? `Workflow run failed in step ${failedStep.name}.`
            : `Workflow run failed in step ${text(result.lastStepName, "unknown")}.`,
        });
      }

      return await finalizeRun(run, {
        currentStep: null,
        currentStepIndex: null,
        eventType: "run.finished",
        status: "success",
        summary: "Workflow run completed successfully.",
      });
    } catch (error) {
      await markQueuedSteps(run.id, -1, activeState.cancelRequested ? "cancelled" : "skipped");
      return await finalizeRun(run, {
        currentStep: null,
        currentStepIndex: null,
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
        trigger: triggerKind,
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
        releaseId: text(context.release_id) || null,
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

  return {
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

      if (active) {
        active.cancelRequested = true;
        if (active.child && !active.child.killed) {
          try { active.child.kill("SIGTERM"); } catch {}
        }
        return await updateRun(repositoryId, runId, {
          summary: `Cancellation requested by ${text(actor.id)}.`,
        });
      }

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

    async listWorkflowRunSteps(repositoryId: string, runId: string) {
      await readRequiredRun(repositoryId, runId);
      return await storage.listWorkflowRunSteps(runId);
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
}

export { createGitForgeActionsRuntime, isTerminalRunStatus };
