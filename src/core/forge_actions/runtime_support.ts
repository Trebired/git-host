import { randomUUID } from "node:crypto";

import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeActionsStorage,
  GitForgeWorkflow,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunJobStatus,
  GitForgeWorkflowRunStepStatus,
  GitForgeWorkflowTriggerKind,
  RunGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { resolveWorkflowString } from "#6fxc5ur8a90x";
import { normalizeEnv } from "#0v8uzq2zukc8";
import { readRepositoryWorkflow, resolveRepositoryWorkflowRoot } from "#nj0t6f5vyy3x";
import { runGit } from "#96b00569f1f4";
import {
  buildExpressionContext,
  nowIso,
  validateDispatchInputs,
} from "./shared.js";
import type {
  CreateGitForgeActionsRuntimeOptions,
  ResolvedExecutionContext,
  WorkflowRunListener,
} from "./shared.js";

type RuntimeSupportContext = {
  options: CreateGitForgeActionsRuntimeOptions;
  runListeners: Map<string, Set<WorkflowRunListener>>;
  runSequences: Map<string, number>;
  runner: ReturnType<typeof import("./shared.js").normalizeRunner>;
  storage: GitForgeActionsStorage;
};

function createNextRunSequence(storage: GitForgeActionsStorage, runSequences: Map<string, number>) {
  return async (runId: string) => {
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
  };
}

function createEmitRunEvent(context: RuntimeSupportContext, nextRunSequence: ReturnType<typeof createNextRunSequence>) {
  return async (
    run: GitForgeWorkflowRun,
    input: Omit<GitForgeWorkflowRunEvent, "created_at" | "id" | "repository_id" | "run_id" | "sequence" | "workflow_id">,
  ) => {
    const event = await context.storage.appendWorkflowRunEvent({
      ...input,
      created_at: nowIso(),
      id: randomUUID(),
      repository_id: run.repository_id,
      run_id: run.id,
      sequence: await nextRunSequence(run.id),
      workflow_id: run.workflow_id,
    });
    const listeners = Array.from(context.runListeners.get(run.id) || []);
    await Promise.all(listeners.map(async (listener) => {
      try {
        await listener(event);
      } catch {}
    }));
    return event;
  };
}

function createReadRepositoryPath(options: CreateGitForgeActionsRuntimeOptions) {
  return async (repositoryId: string) => {
    const summary = await options.gitHost.readSummary(repositoryId);
    return summary.repository.path;
  };
}

function createResolveCommit() {
  return async (repositoryPath: string, refInput: string) => {
    const ref = text(refInput, "HEAD");
    const res = await runGit(["rev-parse", ref], { cwd: repositoryPath });
    if (!res.ok) {
      throw new GitHostError("git_command_failed", text(res.stderr, `Failed to resolve ref "${ref}".`), {
        ref,
        repositoryPath,
      });
    }
    return text(res.stdout);
  };
}

function createResolveRunTarget(options: CreateGitForgeActionsRuntimeOptions, resolveCommit: ReturnType<typeof createResolveCommit>) {
  return async (repositoryId: string, input: { branch?: string; commitHash?: string; ref?: string }) => {
    const summary = await options.gitHost.readSummary(repositoryId);
    const repositoryPath = summary.repository.path;
    const branch = text(input.branch, summary.repository.current_branch) || null;
    const ref = text(input.ref, branch || "HEAD");
    const commitHash = text(input.commitHash) || await resolveCommit(repositoryPath, ref);
    return { branch, commitHash, ref, repositoryPath };
  };
}

function createReadRequiredRun(storage: GitForgeActionsStorage) {
  return async (repositoryId: string, runId: string) => {
    const run = await storage.readWorkflowRun(repositoryId, runId);
    if (!run) {
      throw new GitHostError("forge_resource_not_found", `Workflow run "${runId}" was not found.`, {
        repositoryId,
        runId,
      });
    }
    return run;
  };
}

function createUpdateRun(storage: GitForgeActionsStorage) {
  return async (repositoryId: string, runId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRun"]>[2]) => {
    const run = await storage.updateWorkflowRun(repositoryId, runId, input);
    if (!run) {
      throw new GitHostError("forge_resource_not_found", `Workflow run "${runId}" was not found.`, {
        repositoryId,
        runId,
      });
    }
    return run;
  };
}

function createUpdateJob(storage: GitForgeActionsStorage) {
  return async (runId: string, jobRunId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunJob"]>[2]) => {
    const job = await storage.updateWorkflowRunJob(runId, jobRunId, input);
    if (!job) {
      throw new GitHostError("forge_resource_not_found", `Workflow job run "${jobRunId}" was not found.`, {
        jobRunId,
        runId,
      });
    }
    return job;
  };
}

function createUpdateStep(storage: GitForgeActionsStorage) {
  return async (runId: string, stepId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunStep"]>[2]) => {
    const step = await storage.updateWorkflowRunStep(runId, stepId, input);
    if (!step) {
      throw new GitHostError("forge_resource_not_found", `Workflow run step "${stepId}" was not found.`, {
        runId,
        stepId,
      });
    }
    return step;
  };
}

function createReadWorkflowAtRef(options: CreateGitForgeActionsRuntimeOptions) {
  return async (repositoryId: string, repositoryPath: string, ref: string | undefined, workflowId: string) => {
    const workflowRoot = await resolveRepositoryWorkflowRoot(options.actions, repositoryId);
    return await readRepositoryWorkflow({
      ref,
      repositoryId,
      repositoryPath,
      workflowId,
      workflowRoot,
    });
  };
}

function createResolveExecutionContext(options: CreateGitForgeActionsRuntimeOptions) {
  return async (
    repositoryId: string,
    workflow: GitForgeWorkflow,
    input: RunGitForgeWorkflowInput & {
      triggerContext: Record<string, unknown>;
      triggerKind: GitForgeWorkflowTriggerKind;
    },
  ): Promise<ResolvedExecutionContext> => {
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
  };
}

function createMarkQueuedStepsForJob(storage: GitForgeActionsStorage) {
  return async (runId: string, jobRunId: string, status: Extract<GitForgeWorkflowRunStepStatus, "cancelled" | "skipped">) => {
    const steps = await storage.listWorkflowRunSteps(runId, { jobRunId });
    const now = nowIso();
    await Promise.all(steps
      .filter((step) => step.status === "queued")
      .map((step) => storage.updateWorkflowRunStep(runId, step.id, {
        finished_at: now,
        status,
      })));
  };
}

function createMarkQueuedJobsAndSteps(
  storage: GitForgeActionsStorage,
  markQueuedStepsForJob: ReturnType<typeof createMarkQueuedStepsForJob>,
) {
  return async (runId: string, status: Extract<GitForgeWorkflowRunJobStatus, "cancelled" | "skipped">) => {
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
  };
}

function createFinalizeRun(
  updateRun: ReturnType<typeof createUpdateRun>,
  emitRunEvent: ReturnType<typeof createEmitRunEvent>,
) {
  return async (
    run: GitForgeWorkflowRun,
    input: { eventType: GitForgeWorkflowRunEvent["type"]; status: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStatus; summary: string },
  ) => {
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
  };
}

function createResolveConcurrencyGroup() {
  return async (
    repositoryId: string,
    workflow: GitForgeWorkflow,
    input: RunGitForgeWorkflowInput & { triggerContext: Record<string, unknown>; triggerKind: GitForgeWorkflowTriggerKind },
    runTarget: Awaited<ReturnType<ReturnType<typeof createResolveRunTarget>>>,
    execution: ResolvedExecutionContext,
  ) => {
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
  };
}

function createRuntimeSupport(context: RuntimeSupportContext) {
  const nextRunSequence = createNextRunSequence(context.storage, context.runSequences);
  const emitRunEvent = createEmitRunEvent(context, nextRunSequence);
  const readRepositoryPath = createReadRepositoryPath(context.options);
  const resolveCommit = createResolveCommit();
  const resolveRunTarget = createResolveRunTarget(context.options, resolveCommit);
  const readRequiredRun = createReadRequiredRun(context.storage);
  const updateRun = createUpdateRun(context.storage);
  const updateJob = createUpdateJob(context.storage);
  const updateStep = createUpdateStep(context.storage);
  const readWorkflowAtRef = createReadWorkflowAtRef(context.options);
  const resolveExecutionContext = createResolveExecutionContext(context.options);
  const markQueuedStepsForJob = createMarkQueuedStepsForJob(context.storage);
  const markQueuedJobsAndSteps = createMarkQueuedJobsAndSteps(context.storage, markQueuedStepsForJob);
  const finalizeRun = createFinalizeRun(updateRun, emitRunEvent);
  const resolveConcurrencyGroup = createResolveConcurrencyGroup();
  return {
    emitRunEvent,
    finalizeRun,
    markQueuedJobsAndSteps,
    markQueuedStepsForJob,
    readRepositoryPath,
    readRequiredRun,
    readWorkflowAtRef,
    resolveCommit,
    resolveConcurrencyGroup,
    resolveExecutionContext,
    resolveRunTarget,
    updateJob,
    updateRun,
    updateStep,
  };
}

export { createRuntimeSupport };
