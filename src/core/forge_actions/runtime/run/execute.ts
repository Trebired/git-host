import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeWorkflowRun,
  GitForgeWorkflowRunJob,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

import { normalizeEnv } from "#0v8uzq2zukc8";
import { resolveActionsWorkspaceRoot } from "#134up1wv9uhu";
import {
  aggregateJobStatus,
  isTerminalJobStatus,
  isTerminalRunStatus,
  nowIso,
} from "#gc1rzxkbhrqu";
import type {
  ActiveRunState,
  ResolvedExecutionContext,
} from "#gc1rzxkbhrqu";
import type { RuntimeContext } from "#oflnw936obpy";

type JobExecutor = ReturnType<typeof import("#arhpamot5o19").createJobExecutor>;

function readExecutionContext(context: RuntimeContext, run: GitForgeWorkflowRun) {
  return context.runExecutionContexts.get(run.id) || {
    actor: (run.execution_context?.actor && typeof run.execution_context.actor === "object")
      ? run.execution_context.actor as Record<string, unknown>
      : undefined,
    env: normalizeEnv(run.execution_context?.env) || {},
    inputs: (run.trigger_context?.inputs && typeof run.trigger_context.inputs === "object")
      ? run.trigger_context.inputs as Record<string, boolean | string>
      : {},
    metadata: (run.execution_context?.metadata && typeof run.execution_context.metadata === "object")
      ? run.execution_context.metadata as Record<string, unknown>
      : undefined,
    secrets: {},
  } satisfies ResolvedExecutionContext;
}

async function startRunExecution(context: RuntimeContext, repositoryId: string, runId: string) {
  let run = await context.runtimeSupport.readRequiredRun(repositoryId, runId);
  if (isTerminalRunStatus(run.status)) return { done: true as const, run };
  run = await context.runtimeSupport.updateRun(repositoryId, runId, {
    runner: context.runner,
    started_at: nowIso(),
    status: "starting",
    summary: "Preparing workflow run.",
  });
  await context.runtimeSupport.emitRunEvent(run, {
    metadata: { runner: context.runner },
    status: "starting",
    summary: run.summary,
    type: "run.status",
  });
  return { done: false as const, run };
}

function resolveNextRunnableJobIndex(
  allJobs: GitForgeWorkflowRunJob[],
  pendingJobs: GitForgeWorkflowRunJob[],
  completedByJobId: Map<string, GitForgeWorkflowRunJob[]>,
) {
  return pendingJobs.findIndex((job) => (
    (job.needs || []).every((need) => {
      const results = completedByJobId.get(need) || [];
      const expected = allJobs.filter((entry) => entry.job_id === need).length;
      return results.length === expected && results.every((entry) => isTerminalJobStatus(entry.status));
    })
  ));
}

function buildNeeds(nextJob: GitForgeWorkflowRunJob, completedByJobId: Map<string, GitForgeWorkflowRunJob[]>) {
  return Object.fromEntries((nextJob.needs || []).map((need) => {
    const statuses = (completedByJobId.get(need) || []).map((entry) => entry.status);
    return [need, { result: aggregateJobStatus(statuses) }] as const;
  }));
}

async function runPendingJobs(
  context: RuntimeContext,
  executeJob: JobExecutor,
  run: GitForgeWorkflowRun,
  repositoryPath: string,
  workflow: Awaited<ReturnType<RuntimeContext["runtimeSupport"]["readWorkflowAtRef"]>>,
  execution: ResolvedExecutionContext,
  activeState: ActiveRunState,
) {
  const artifactsRoot = path.join(resolveActionsWorkspaceRoot(context.options.actions, run.repository_id, run.id), "artifacts");
  const allJobs = await context.storage.listWorkflowRunJobs(run.id);
  const pendingJobs = Array.from(allJobs).sort((left, right) => left.index - right.index);
  const completedByJobId = new Map<string, GitForgeWorkflowRunJob[]>();
  while (pendingJobs.length) {
    if (activeState.cancelRequested) return { cancelled: true as const };
    const nextIndex = resolveNextRunnableJobIndex(allJobs, pendingJobs, completedByJobId);
    if (nextIndex < 0) {
      throw new GitHostError("forge_invalid_workflow_definition", `Workflow "${workflow.id}" has no runnable job order.`, {
        workflowId: workflow.id,
      });
    }
    const nextJob = pendingJobs.splice(nextIndex, 1)[0]!;
    const finishedJob = await executeJob({
      activeState,
      artifactsRoot,
      execution,
      jobRun: nextJob,
      needs: buildNeeds(nextJob, completedByJobId),
      repositoryPath,
      run,
      workflow,
    });
    const existing = completedByJobId.get(finishedJob.job_id) || [];
    existing.push(finishedJob);
    completedByJobId.set(finishedJob.job_id, existing);
  }
  return { cancelled: false as const };
}

async function finalizeCompletedRun(context: RuntimeContext, run: GitForgeWorkflowRun) {
  const jobs = await context.storage.listWorkflowRunJobs(run.id);
  if (jobs.some((job) => job.status === "failed")) {
    const failedJob = jobs.find((job) => job.status === "failed");
    await context.runtimeSupport.markQueuedJobsAndSteps(run.id, "skipped");
    return await context.runtimeSupport.finalizeRun(run, {
      eventType: "run.failed",
      status: "failed",
      summary: text(failedJob?.summary, "Workflow run failed."),
    });
  }
  if (jobs.some((job) => job.status === "cancelled")) {
    await context.runtimeSupport.markQueuedJobsAndSteps(run.id, "cancelled");
    return await context.runtimeSupport.finalizeRun(run, {
      eventType: "run.cancelled",
      status: "cancelled",
      summary: "Workflow run cancelled.",
    });
  }
  if (jobs.every((job) => job.status === "skipped")) {
    return await context.runtimeSupport.finalizeRun(run, {
      eventType: "run.finished",
      status: "skipped",
      summary: "Workflow run was skipped.",
    });
  }
  return await context.runtimeSupport.finalizeRun(run, {
    eventType: "run.finished",
    status: "success",
    summary: "Workflow run completed successfully.",
  });
}

async function handleRunFailure(context: RuntimeContext, run: GitForgeWorkflowRun, cancelRequested: boolean, error: unknown) {
  await context.runtimeSupport.markQueuedJobsAndSteps(run.id, cancelRequested ? "cancelled" : "skipped");
  return await context.runtimeSupport.finalizeRun(run, {
    eventType: cancelRequested ? "run.cancelled" : "run.failed",
    status: cancelRequested ? "cancelled" : "failed",
    summary: cancelRequested
      ? "Workflow run cancelled."
      : (error instanceof Error ? error.message : "Workflow run failed."),
  });
}

function cleanupActiveRun(context: RuntimeContext, runId: string) {
  const activeState = context.activeRuns.get(runId);
  if (activeState?.child && !activeState.child.killed) {
    try { activeState.child.kill("SIGKILL"); } catch {}
  }
  context.activeRuns.delete(runId);
  context.runExecutionContexts.delete(runId);
}

function createRunExecutor(context: RuntimeContext, executeJob: JobExecutor) {
  async function executeRun(repositoryId: string, runId: string) {
    const started = await startRunExecution(context, repositoryId, runId);
    if (started.done) return started.run;
    const repositoryPath = await context.runtimeSupport.readRepositoryPath(repositoryId);
    const workflow = await context.runtimeSupport.readWorkflowAtRef(repositoryId, repositoryPath, started.run.ref, started.run.workflow_id);
    const execution = readExecutionContext(context, started.run);
    const activeState: ActiveRunState = { cancelRequested: false, child: null };
    context.activeRuns.set(started.run.id, activeState);
    try {
      const result = await runPendingJobs(context, executeJob, started.run, repositoryPath, workflow, execution, activeState);
      if (result.cancelled) {
        await context.runtimeSupport.markQueuedJobsAndSteps(started.run.id, "cancelled");
        return await context.runtimeSupport.finalizeRun(started.run, {
          eventType: "run.cancelled",
          status: "cancelled",
          summary: "Workflow run cancelled.",
        });
      }
      return await finalizeCompletedRun(context, started.run);
    } catch (error) {
      return await handleRunFailure(context, started.run, activeState.cancelRequested, error);
    } finally {
      cleanupActiveRun(context, started.run.id);
    }
  }

  async function processQueue() {
    if (context.processingRef.value) return;
    context.processingRef.value = true;
    try {
      while (context.queuedRuns.length) {
        const next = context.queuedRuns.shift();
        if (!next) continue;
        const run = await context.storage.readWorkflowRun(next.repositoryId, next.runId);
        if (!run || isTerminalRunStatus(run.status)) continue;
        await executeRun(next.repositoryId, next.runId);
      }
    } finally {
      context.processingRef.value = false;
    }
  }

  return {
    executeRun,
    processQueue,
  };
}

export { createRunExecutor };
