import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeWorkflowRun,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepStatus,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { nowIso } from "#gc1rzxkbhrqu";
import { createUsesDispatcher } from "./uses.js";
import type { JobStepSupportContext } from "./context.js";

function supportedRunnerLabels(
  runner: ReturnType<typeof import("#gc1rzxkbhrqu").normalizeRunner>,
) {
  return new Set(runner.labels || []);
}

function assertJobRunnerSupported(
  runner: ReturnType<typeof import("#gc1rzxkbhrqu").normalizeRunner>,
  jobRun: GitForgeWorkflowRunJob,
) {
  const labels = supportedRunnerLabels(runner);
  const unsupported = jobRun.runs_on.filter(
    (entry) => !labels.has(text(entry)),
  );
  if (unsupported.length) {
    throw new GitHostError(
      "forge_actions_runner_failed",
      `Job "${jobRun.name}" requested unsupported runner labels: ${unsupported.join(", ")}.`,
      {
        jobRunId: jobRun.id,
        labels: unsupported,
      },
    );
  }
}

function createEmitJobStarted(
  emitRunEvent: JobStepSupportContext["emitRunEvent"],
) {
  return async(run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob) => {
    await emitRunEvent(run, {
        job_id: jobRun.job_id,
        job_name: jobRun.name,
        job_run_id: jobRun.id,
        status: "running",
        summary: `Running job ${jobRun.name}.`,
        type: "job.started",
    });
  };
}

function createEmitJobFinished(
  emitRunEvent: JobStepSupportContext["emitRunEvent"],
) {
  return async(run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob) => {
    await emitRunEvent(run, {
        job_id: jobRun.job_id,
        job_name: jobRun.name,
        job_run_id: jobRun.id,
        status: jobRun.status,
        summary: jobRun.summary,
        type: "job.finished",
    });
  };
}

function createFinishStep(
  updateStep: JobStepSupportContext["updateStep"],
  emitRunEvent: JobStepSupportContext["emitRunEvent"],
) {
  return async(
    run: GitForgeWorkflowRun,
    jobRun: GitForgeWorkflowRunJob,
    stepRun: GitForgeWorkflowRunStep,
    input: {
      exitCode?: number | null;
      outputPreview?: string;
      status: GitForgeWorkflowRunStepStatus;
      summary: string;
    },
  ) => {
    const finished = await updateStep(run.id, stepRun.id, {
        exit_code:
        input.exitCode === undefined ? stepRun.exit_code : input.exitCode,
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
  };
}

function createSkipJob(
  context: JobStepSupportContext,
  emitJobFinished: ReturnType<typeof createEmitJobFinished>,
) {
  return async(
    run: GitForgeWorkflowRun,
    jobRun: GitForgeWorkflowRunJob,
    summary: string,
  ) => {
    await context.markQueuedStepsForJob(run.id, jobRun.id, "skipped");
    const finished = await context.updateJob(run.id, jobRun.id, {
        finished_at: nowIso(),
        status: "skipped",
        summary,
    });
    await emitJobFinished(run, finished);
    return finished;
  };
}

function createCancelJob(
  context: JobStepSupportContext,
  emitJobFinished: ReturnType<typeof createEmitJobFinished>,
) {
  return async(
    run: GitForgeWorkflowRun,
    jobRun: GitForgeWorkflowRunJob,
    summary: string,
  ) => {
    await context.markQueuedStepsForJob(run.id, jobRun.id, "cancelled");
    const finished = await context.updateJob(run.id, jobRun.id, {
        finished_at: nowIso(),
        status: "cancelled",
        summary,
    });
    await emitJobFinished(run, finished);
    return finished;
  };
}

function createJobStepSupport(context: JobStepSupportContext) {
  const emitJobStarted = createEmitJobStarted(context.emitRunEvent);
  const emitJobFinished = createEmitJobFinished(context.emitRunEvent);
  return {
    assertJobRunnerSupported: (jobRun: GitForgeWorkflowRunJob) =>
    assertJobRunnerSupported(context.runner, jobRun),
    cancelJob: createCancelJob(context, emitJobFinished),
    emitJobFinished,
    emitJobStarted,
    executeUsesStep: createUsesDispatcher(context),
    finishStep: createFinishStep(context.updateStep, context.emitRunEvent),
    skipJob: createSkipJob(context, emitJobFinished),
  };
}

export { createJobStepSupport };
