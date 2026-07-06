import { randomUUID } from "node:crypto";

import type {
  GitForgeWorkflow,
  GitForgeWorkflowRun,
  RunGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

import { assertAcyclicWorkflow, planWorkflowJobs } from "#evdr4zn4ntk5";
import { normalizeTriggerContext, nowIso } from "#gc1rzxkbhrqu";
import type {
  CancelWorkflowRun,
  QueueWorkflowRun,
  RuntimeContext,
} from "./types.js";

type QueueSupportInput = {
  cancelWorkflowRunRef: {
    current: CancelWorkflowRun | null;
  };
  context: RuntimeContext;
  scheduleQueueProcessing: () => void;
};

async function createPlannedStepRuns(
  context: RuntimeContext,
  runId: string,
  jobRunId: string,
  steps: GitForgeWorkflow["jobs"][number]["steps"],
) {
  for (const [index, step] of steps.entries()) {
    await context.storage.createWorkflowRunStep({
      command: text(step.run, step.uses),
      exit_code: null,
      finished_at: null,
      id: randomUUID(),
      index,
      job_run_id: jobRunId,
      kind: step.kind || (step.uses ? "uses" : "shell"),
      metadata: {
        env: step.env,
        if: step.if,
        shell: step.shell,
        with: step.with,
      },
      name: text(step.name, `Step ${index + 1}`),
      output_preview: "",
      run_id: runId,
      started_at: null,
      status: "queued",
      uses: text(step.uses) || null,
    });
  }
}

async function createPlannedJobRuns(
  context: RuntimeContext,
  run: GitForgeWorkflowRun,
  workflow: GitForgeWorkflow,
) {
  for (const plannedJob of planWorkflowJobs(workflow)) {
    const jobRun = await context.storage.createWorkflowRunJob({
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
    await createPlannedStepRuns(context, run.id, jobRun.id, plannedJob.job.steps);
  }
}

async function emitAcceptedRun(
  context: RuntimeContext,
  run: GitForgeWorkflowRun,
  workflow: GitForgeWorkflow,
) {
  await context.runtimeSupport.emitRunEvent(run, {
    metadata: {
      branch: run.branch,
      definition_path: workflow.definition_path,
      ref: run.ref,
    },
    status: "queued",
    summary: run.summary,
    type: "run.accepted",
  });
}

async function createQueuedRun(
  context: RuntimeContext,
  repositoryId: string,
  workflow: GitForgeWorkflow,
  runInput: RunGitForgeWorkflowInput & {
    triggerKind: import("#1mbdfxwwqqpa").GitForgeWorkflowTriggerKind;
  },
) {
  const triggerContext = normalizeTriggerContext(runInput.triggerContext);
  const target = await context.runtimeSupport.resolveRunTarget(repositoryId, runInput);
  const execution = await context.runtimeSupport.resolveExecutionContext(repositoryId, workflow, {
    ...runInput,
    triggerContext,
  });
  const concurrencyGroup = await context.runtimeSupport.resolveConcurrencyGroup(repositoryId, workflow, {
    ...runInput,
    triggerContext,
  }, target, execution);
  const run = await context.storage.createWorkflowRun({
    branch: target.branch,
    commit_hash: target.commitHash,
    ...(workflow.concurrency ? { concurrency_cancel_in_progress: workflow.concurrency.cancel_in_progress === true } : {}),
    ...(concurrencyGroup ? { concurrency_group: concurrencyGroup } : {}),
    created_at: nowIso(),
    created_by: text(runInput.actor.id, text(runInput.actor.name, "system")),
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
      event_name: runInput.triggerKind === "manual" ? "workflow_dispatch" : runInput.triggerKind,
      inputs: execution.inputs,
      workflow_definition_path: workflow.definition_path,
    },
    trigger_kind: runInput.triggerKind,
    workflow_id: workflow.id,
  });
  return { execution, run };
}

async function cancelConflictingRuns(
  context: RuntimeContext,
  repositoryId: string,
  runId: string,
  concurrencyGroup: string,
  actor: RunGitForgeWorkflowInput["actor"],
  cancelWorkflowRun: CancelWorkflowRun | null,
) {
  if (!cancelWorkflowRun) return;
  const active = await context.storage.listWorkflowRuns(repositoryId, {
    status: ["queued", "running", "starting"],
  });
  for (const entry of active) {
    if (entry.id === runId) continue;
    if (text(entry.concurrency_group) !== text(concurrencyGroup)) continue;
    await cancelWorkflowRun(repositoryId, entry.id, actor);
  }
}

function createQueueSupport(input: QueueSupportInput): QueueWorkflowRun {
  return async (repositoryId, workflow, runInput) => {
    const { context } = input;
    assertAcyclicWorkflow(workflow);
    const { execution, run } = await createQueuedRun(context, repositoryId, workflow, runInput);
    await createPlannedJobRuns(context, run, workflow);
    await emitAcceptedRun(context, run, workflow);
    context.runExecutionContexts.set(run.id, execution);
    if (run.concurrency_group && workflow.concurrency?.cancel_in_progress) {
      await cancelConflictingRuns(
        context,
        repositoryId,
        run.id,
        run.concurrency_group,
        runInput.actor,
        input.cancelWorkflowRunRef.current,
      );
    }
    context.queuedRuns.push({ repositoryId, runId: run.id });
    input.scheduleQueueProcessing();
    return run;
  };
}

export { createQueueSupport };
