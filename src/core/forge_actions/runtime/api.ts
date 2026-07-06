import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeOptions,
  GitForgeActivityEntry,
  GitForgeActor,
  RunGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

import { listRepositoryWorkflows, matchesWorkflowTrigger, resolveRepositoryWorkflowRoot } from "#nj0t6f5vyy3x";
import {
  ACTIVITY_LISTENER_SYMBOL,
  ACTIVITY_WRAPPED_SYMBOL,
  isTerminalRunStatus,
  nowIso,
} from "#gc1rzxkbhrqu";
import type {
  QueueWorkflowRun,
  RuntimeContext,
} from "./types.js";

function createActor(entry: GitForgeActivityEntry): GitForgeActor {
  return {
    id: text(entry.actor_id, text(entry.actor_label, "system")),
    name: text(entry.actor_label, entry.actor_id),
  };
}

async function enqueueWorkflowsForTrigger(
  context: RuntimeContext,
  queueWorkflowRun: QueueWorkflowRun,
  repositoryId: string,
  triggerKind: import("#1mbdfxwwqqpa").GitForgeWorkflowTriggerKind,
  actor: GitForgeActor,
  triggerContext: Record<string, unknown>,
) {
  const target = await context.runtimeSupport.resolveRunTarget(repositoryId, {
    branch: text(triggerContext.branch),
    commitHash: text(triggerContext.commit_hash, text(triggerContext.head_commit)),
    ref: text(triggerContext.ref, text(triggerContext.tag_name, text(triggerContext.branch, "HEAD"))),
  });
  const workflowRoot = await resolveRepositoryWorkflowRoot(context.options.actions, repositoryId);
  const workflows = await listRepositoryWorkflows({
    filters: { enabled: true },
    ref: target.ref,
    repositoryId,
    repositoryPath: target.repositoryPath,
    workflowRoot,
  });
  const createdRuns = [];
  for (const workflow of workflows) {
    if (!matchesWorkflowTrigger(workflow, triggerKind, triggerContext)) continue;
    createdRuns.push(await queueWorkflowRun(repositoryId, workflow, {
      actor,
      branch: target.branch || undefined,
      commitHash: target.commitHash,
      ref: target.ref,
      triggerContext,
      triggerKind,
    }));
  }
  return createdRuns;
}

async function handleReleaseActivity(
  context: RuntimeContext,
  queueWorkflowRun: QueueWorkflowRun,
  entry: GitForgeActivityEntry,
  actor: GitForgeActor,
) {
  const releaseId = text(entry.metadata?.release_id);
  const release = releaseId ? await context.options.releases.readRelease(entry.repository_id, releaseId) : null;
  const targetRef = text(release?.target_ref);
  const repositoryPath = await context.runtimeSupport.readRepositoryPath(entry.repository_id);
  const commitHash = targetRef ? await context.runtimeSupport.resolveCommit(repositoryPath, targetRef) : "";
  await enqueueWorkflowsForTrigger(context, queueWorkflowRun, entry.repository_id, entry.kind as "release.create" | "release.update", actor, {
    ...(entry.metadata || {}),
    activity_id: entry.id,
    commit_hash: commitHash,
    ref: text(release?.tag_name, targetRef),
    release_id: release?.id,
    tag_name: text(release?.tag_name, text(entry.metadata?.tag_name)),
  });
}

function createBindActivityStorage(context: RuntimeContext, queueWorkflowRun: QueueWorkflowRun) {
  return (activityStorage: CreateGitForgeOptions["storage"]["activity"]) => {
    const store = activityStorage as typeof activityStorage & {
      [ACTIVITY_LISTENER_SYMBOL]?: Set<(entry: GitForgeActivityEntry) => Promise<void>>;
      [ACTIVITY_WRAPPED_SYMBOL]?: boolean;
    };
    if (!store[ACTIVITY_LISTENER_SYMBOL]) store[ACTIVITY_LISTENER_SYMBOL] = new Set();
    store[ACTIVITY_LISTENER_SYMBOL]!.add(async (entry) => {
      const actor = createActor(entry);
      if (entry.kind === "repository.push") {
        await enqueueWorkflowsForTrigger(context, queueWorkflowRun, entry.repository_id, "push", actor, {
          ...(entry.metadata || {}),
          activity_id: entry.id,
        });
        return;
      }
      if (entry.kind === "release.create" || entry.kind === "release.update") {
        await handleReleaseActivity(context, queueWorkflowRun, entry, actor);
      }
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
  };
}

function createCancelWorkflowRun(context: RuntimeContext) {
  return async (repositoryId: string, runId: string, actor: GitForgeActor) => {
    const run = await context.runtimeSupport.readRequiredRun(repositoryId, runId);
    if (isTerminalRunStatus(run.status)) return run;
    const active = context.activeRuns.get(run.id);
    await context.runtimeSupport.emitRunEvent(run, {
      metadata: { actor_id: actor.id },
      status: "running",
      summary: `Cancellation requested by ${text(actor.id)}.`,
      type: "run.cancellation_requested",
    });
    if (active) {
      active.cancelRequested = true;
      if (active.child && !active.child.killed) {
        try { active.child.kill("SIGTERM"); } catch {}
      }
      return await context.runtimeSupport.updateRun(repositoryId, runId, {
        summary: `Cancellation requested by ${text(actor.id)}.`,
      });
    }
    await context.runtimeSupport.markQueuedJobsAndSteps(run.id, "cancelled");
    const cancelled = await context.runtimeSupport.updateRun(repositoryId, runId, {
      finished_at: nowIso(),
      status: "cancelled",
      summary: `Cancelled by ${text(actor.id)}.`,
    });
    await context.runtimeSupport.emitRunEvent(cancelled, {
      status: "cancelled",
      summary: cancelled.summary,
      type: "run.cancelled",
    });
    return cancelled;
  };
}

function createReadApi(context: RuntimeContext) {
  return {
    async listWorkflows(repositoryId: string, filters?: import("#1mbdfxwwqqpa").GitForgeWorkflowFilters) {
      const repositoryPath = await context.runtimeSupport.readRepositoryPath(repositoryId);
      const workflowRoot = await resolveRepositoryWorkflowRoot(context.options.actions, repositoryId);
      return await listRepositoryWorkflows({ filters, repositoryId, repositoryPath, workflowRoot });
    },
    async readWorkflow(repositoryId: string, workflowId: string) {
      const repositoryPath = await context.runtimeSupport.readRepositoryPath(repositoryId);
      return await context.runtimeSupport.readWorkflowAtRef(repositoryId, repositoryPath, undefined, workflowId);
    },
    async listWorkflowRuns(repositoryId: string, filters?: import("#1mbdfxwwqqpa").GitForgeWorkflowRunFilters) {
      return await context.storage.listWorkflowRuns(repositoryId, filters);
    },
    async readWorkflowRun(repositoryId: string, runId: string) {
      return await context.runtimeSupport.readRequiredRun(repositoryId, runId);
    },
    async listWorkflowRunJobs(repositoryId: string, runId: string, filters?: { jobId?: string; status?: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJobStatus | import("#1mbdfxwwqqpa").GitForgeWorkflowRunJobStatus[] }) {
      await context.runtimeSupport.readRequiredRun(repositoryId, runId);
      return await context.storage.listWorkflowRunJobs(runId, filters);
    },
    async listWorkflowRunSteps(repositoryId: string, runId: string, filters?: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStepFilters) {
      await context.runtimeSupport.readRequiredRun(repositoryId, runId);
      return await context.storage.listWorkflowRunSteps(runId, filters);
    },
    async listWorkflowRunArtifacts(repositoryId: string, runId: string, filters?: { jobRunId?: string; name?: string }) {
      await context.runtimeSupport.readRequiredRun(repositoryId, runId);
      return await context.storage.listWorkflowRunArtifacts(runId, filters);
    },
    async listWorkflowRunEvents(repositoryId: string, runId: string, filters?: import("#1mbdfxwwqqpa").GitForgeWorkflowRunEventFilters) {
      await context.runtimeSupport.readRequiredRun(repositoryId, runId);
      return await context.storage.listWorkflowRunEvents(runId, filters);
    },
  };
}

function createRunApi(
  context: RuntimeContext,
  queueWorkflowRun: QueueWorkflowRun,
  cancelWorkflowRun: ReturnType<typeof createCancelWorkflowRun>,
) {
  return {
    async runWorkflow(repositoryId: string, workflowId: string, input: RunGitForgeWorkflowInput) {
      const target = await context.runtimeSupport.resolveRunTarget(repositoryId, input);
      const workflow = await context.runtimeSupport.readWorkflowAtRef(repositoryId, target.repositoryPath, target.ref, workflowId);
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
    cancelWorkflowRun,
    subscribeWorkflowRun(repositoryId: string, runId: string, listener: import("#gc1rzxkbhrqu").WorkflowRunListener) {
      void repositoryId;
      let listeners = context.runListeners.get(runId);
      if (!listeners) {
        listeners = new Set();
        context.runListeners.set(runId, listeners);
      }
      listeners.add(listener);
      return {
        close() {
          listeners?.delete(listener);
          if (listeners && listeners.size === 0) {
            context.runListeners.delete(runId);
          }
        },
      };
    },
  };
}

function createRuntimeApi(context: RuntimeContext, queueWorkflowRun: QueueWorkflowRun) {
  const cancelWorkflowRun = createCancelWorkflowRun(context);
  return {
    bindActivityStorage: createBindActivityStorage(context, queueWorkflowRun),
    ...createReadApi(context),
    ...createRunApi(context, queueWorkflowRun, cancelWorkflowRun),
  };
}

export { createRuntimeApi };
