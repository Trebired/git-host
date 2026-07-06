import { text } from "#sy81xkgkmoa0";

import { resolveWorkflowString, type WorkflowExpressionContext } from "#6fxc5ur8a90x";
import { runShellCommand } from "#x2bn6ub493ck";
import { normalizeEnv } from "#0v8uzq2zukc8";
import { createRunRedactor } from "#atvdoorwcqy9";
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  mergeRuntimeEnv,
  normalizeTriggerContext,
  nowIso,
} from "#gc1rzxkbhrqu";
import type {
  ActiveRunState,
} from "#gc1rzxkbhrqu";
import type { RuntimeContext } from "#oflnw936obpy";
import type { ExecuteJobInput } from "#arhpamot5o19";

async function emitOutputChunk(
  context: RuntimeContext,
  input: ExecuteJobInput,
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
  chunk: string,
  stream: "stderr" | "stdout",
) {
  for (const type of ["step.output", "job.output"] as const) {
    await context.runtimeSupport.emitRunEvent(input.run, {
      chunk,
      job_id: jobRun.job_id,
      job_name: jobRun.name,
      job_run_id: jobRun.id,
      status: "running",
      step_id: stepRun.id,
      step_index: stepRun.index,
      step_name: stepRun.name,
      stream,
      type,
    });
  }
}

function resolveStepWith(
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
  stepContext: WorkflowExpressionContext,
) {
  return Object.fromEntries(
    Object.entries((stepRun.metadata?.with && typeof stepRun.metadata.with === "object")
      ? stepRun.metadata.with as Record<string, unknown>
      : {})
      .map(([key, value]) => [key, resolveWorkflowString(String(value), stepContext)] as const),
  );
}

async function failUsesStep(
  context: RuntimeContext,
  input: ExecuteJobInput,
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
  summary: string,
) {
  await context.jobStepSupport.finishStep(input.run, jobRun, stepRun, {
    outputPreview: summary,
    status: input.activeState.cancelRequested ? "cancelled" : "failed",
    summary,
  });
  await context.runtimeSupport.markQueuedStepsForJob(input.run.id, jobRun.id, input.activeState.cancelRequested ? "cancelled" : "skipped");
  const finishedJob = await context.runtimeSupport.updateJob(input.run.id, jobRun.id, {
    current_step: null,
    current_step_index: null,
    finished_at: nowIso(),
    status: input.activeState.cancelRequested ? "cancelled" : "failed",
    summary,
  });
  await context.jobStepSupport.emitJobFinished(input.run, finishedJob);
  return finishedJob;
}

async function executeUsesStep(
  context: RuntimeContext,
  input: ExecuteJobInput,
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
  workspacePath: string,
  stepContext: WorkflowExpressionContext,
  redactor: ReturnType<typeof createRunRedactor>,
) {
  try {
    const result = await context.jobStepSupport.executeUsesStep({
      artifactsRoot: input.artifactsRoot,
      execution: input.execution,
      jobRun,
      run: input.run,
      stepWith: resolveStepWith(stepRun, stepContext),
      stepRun,
      workspacePath,
    });
    const preview = await redactor(result.outputPreview || "");
    if (preview) await emitOutputChunk(context, input, jobRun, stepRun, preview, "stdout");
    await context.jobStepSupport.finishStep(input.run, jobRun, stepRun, {
      outputPreview: preview,
      status: "success",
      summary: result.summary,
    });
    return jobRun;
  } catch (error) {
    const summary = await redactor(error instanceof Error ? error.message : "Action step failed.");
    return await failUsesStep(context, input, jobRun, stepRun, summary);
  }
}

function createShellCallbacks(
  context: RuntimeContext,
  input: ExecuteJobInput,
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
  redactor: ReturnType<typeof createRunRedactor>,
) {
  return {
    onHeartbeat: async () => {
      for (const type of ["step.heartbeat", "job.heartbeat"] as const) {
        await context.runtimeSupport.emitRunEvent(input.run, {
          job_id: jobRun.job_id,
          job_name: jobRun.name,
          job_run_id: jobRun.id,
          status: "running",
          step_id: stepRun.id,
          step_index: stepRun.index,
          step_name: stepRun.name,
          type,
        });
      }
    },
    onOutput: async (stream: "stderr" | "stdout", chunk: string) => {
      await emitOutputChunk(context, input, jobRun, stepRun, await redactor(chunk, stream), stream);
    },
    onSpawn: (child: ActiveRunState["child"]) => {
      input.activeState.child = child;
    },
  };
}

async function finalizeShellFailure(
  context: RuntimeContext,
  input: ExecuteJobInput,
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
) {
  await context.runtimeSupport.markQueuedStepsForJob(input.run.id, jobRun.id, "skipped");
  const finishedJob = await context.runtimeSupport.updateJob(input.run.id, jobRun.id, {
    current_step: null,
    current_step_index: null,
    finished_at: nowIso(),
    status: "failed",
    summary: `Job ${jobRun.name} failed in step ${stepRun.name}.`,
  });
  await context.jobStepSupport.emitJobFinished(input.run, finishedJob);
  return finishedJob;
}

async function finalizeShellCancellation(
  context: RuntimeContext,
  input: ExecuteJobInput,
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
) {
  await context.runtimeSupport.markQueuedStepsForJob(input.run.id, jobRun.id, "cancelled");
  const finishedJob = await context.runtimeSupport.updateJob(input.run.id, jobRun.id, {
    current_step: null,
    current_step_index: null,
    finished_at: nowIso(),
    status: "cancelled",
    summary: `Cancelled during job ${jobRun.name}.`,
  });
  await context.jobStepSupport.emitJobFinished(input.run, finishedJob);
  return finishedJob;
}

async function executeShellStep(
  context: RuntimeContext,
  input: ExecuteJobInput,
  workflowJob: import("#1mbdfxwwqqpa").GitForgeWorkflow["jobs"][number],
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
  workspacePath: string,
  resolvedCommand: string,
  redactor: ReturnType<typeof createRunRedactor>,
) {
  const runtimeEnv = mergeRuntimeEnv({
    actions: context.options.actions,
    execution: input.execution,
    jobEnv: workflowJob.env,
    ...(input.jobRun.matrix ? { matrix: input.jobRun.matrix } : {}),
    run: input.run,
    stepEnv: normalizeEnv(stepRun.metadata?.env),
    triggerContext: normalizeTriggerContext(input.run.trigger_context),
    workflow: input.workflow,
  });
  const result = await runShellCommand({
    ...(context.options.actions?.localRunner?.beforeSpawn ? { beforeSpawn: context.options.actions.localRunner.beforeSpawn } : {}),
    command: resolvedCommand,
    cwd: workspacePath,
    env: runtimeEnv,
    ...(context.options.actions?.localRunner?.execTimeoutMs === undefined ? {} : { execTimeoutMs: context.options.actions.localRunner.execTimeoutMs }),
    ...(context.options.actions?.localRunner?.gid === undefined ? {} : { gid: context.options.actions.localRunner.gid }),
    heartbeatIntervalMs: Math.max(250, Number(context.options.actions?.heartbeatIntervalMs) || DEFAULT_HEARTBEAT_INTERVAL_MS),
    ...(context.options.actions?.localRunner?.uid === undefined ? {} : { uid: context.options.actions.localRunner.uid }),
    ...createShellCallbacks(context, input, jobRun, stepRun, redactor),
    shell: text(stepRun.metadata?.shell, text(context.options.actions?.shell, "bash")) || "bash",
  });
  const preview = await redactor(result.outputPreview);
  if (input.activeState.cancelRequested || result.exitCode === 130) {
    await context.jobStepSupport.finishStep(input.run, jobRun, stepRun, {
      exitCode: result.exitCode,
      outputPreview: preview,
      status: "cancelled",
      summary: `Cancelled during step ${stepRun.name}.`,
    });
    return await finalizeShellCancellation(context, input, jobRun);
  }
  if (result.exitCode !== 0) {
    await context.jobStepSupport.finishStep(input.run, jobRun, stepRun, {
      exitCode: result.exitCode,
      outputPreview: preview,
      status: "failed",
      summary: `Failed step ${stepRun.name}.`,
    });
    return await finalizeShellFailure(context, input, jobRun, stepRun);
  }
  await context.jobStepSupport.finishStep(input.run, jobRun, stepRun, {
    exitCode: result.exitCode,
    outputPreview: preview,
    status: "success",
    summary: `Completed step ${stepRun.name}.`,
  });
  return jobRun;
}

async function executeStartedStep(
  context: RuntimeContext,
  input: ExecuteJobInput,
  workflowJob: import("#1mbdfxwwqqpa").GitForgeWorkflow["jobs"][number],
  jobRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunJob,
  stepRun: import("#1mbdfxwwqqpa").GitForgeWorkflowRunStep,
  workspacePath: string,
  stepContext: WorkflowExpressionContext,
  resolvedCommand: string,
  redactor: ReturnType<typeof createRunRedactor>,
) {
  if (stepRun.kind === "uses") {
    return await executeUsesStep(context, input, jobRun, stepRun, workspacePath, stepContext, redactor);
  }
  return await executeShellStep(context, input, workflowJob, jobRun, stepRun, workspacePath, resolvedCommand, redactor);
}

export { executeStartedStep };
