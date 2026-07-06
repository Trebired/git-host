import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeWorkflow,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunJobStatus,
  GitForgeWorkflowRunStep,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

import { resolveWorkflowBoolean, resolveWorkflowString, type WorkflowExpressionContext } from "#6fxc5ur8a90x";
import { materializeJobWorkspace, runShellCommand } from "#x2bn6ub493ck";
import { normalizeEnv } from "#0v8uzq2zukc8";
import { createRunRedactor } from "#atvdoorwcqy9";
import { resolveActionsWorkspaceRoot } from "#134up1wv9uhu";
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  buildExpressionContext,
  isTerminalJobStatus,
  mergeRuntimeEnv,
  normalizeTriggerContext,
  nowIso,
} from "#gc1rzxkbhrqu";
import type {
  ActiveRunState,
  ResolvedExecutionContext,
} from "#gc1rzxkbhrqu";
import type { RuntimeContext } from "#oflnw936obpy";
import { executeStartedStep } from "./step/execute.js";

type ExecuteJobInput = {
  activeState: ActiveRunState;
  artifactsRoot: string;
  execution: ResolvedExecutionContext;
  jobRun: GitForgeWorkflowRunJob;
  needs: Record<string, { result: GitForgeWorkflowRunJobStatus }>;
  repositoryPath: string;
  run: GitForgeWorkflowRun;
  workflow: GitForgeWorkflow;
};

function readWorkflowJob(workflow: GitForgeWorkflow, jobId: string) {
  const workflowJob = workflow.jobs.find((entry) => entry.id === jobId);
  if (!workflowJob) {
    throw new GitHostError("forge_invalid_workflow_definition", `Workflow job "${jobId}" no longer exists.`, {
      jobId,
      workflowId: workflow.id,
    });
  }
  return workflowJob;
}

function buildBaseContext(input: ExecuteJobInput) {
  return buildExpressionContext({
    execution: input.execution,
    ...(input.jobRun.matrix ? { matrix: input.jobRun.matrix } : {}),
    needs: input.needs,
    run: input.run,
    triggerContext: normalizeTriggerContext(input.run.trigger_context),
    workflow: input.workflow,
  });
}

async function failUnsupportedJob(
  context: RuntimeContext,
  run: GitForgeWorkflowRun,
  jobRun: GitForgeWorkflowRunJob,
  summary: string,
) {
  await context.runtimeSupport.markQueuedStepsForJob(run.id, jobRun.id, "skipped");
  const failedJob = await context.runtimeSupport.updateJob(run.id, jobRun.id, {
    finished_at: nowIso(),
    status: "failed",
    summary,
  });
  await context.jobStepSupport.emitJobFinished(run, failedJob);
  return failedJob;
}

async function resolvePreExecutionResult(
  context: RuntimeContext,
  input: ExecuteJobInput,
  workflowJob: GitForgeWorkflow["jobs"][number],
  baseContext: WorkflowExpressionContext,
) {
  const dependencyStatus = Object.values(input.needs).map((entry) => entry.result);
  if (!workflowJob.if && dependencyStatus.some((status) => status !== "success")) {
    return await context.jobStepSupport.skipJob(input.run, input.jobRun, "Skipped because a dependency did not complete successfully.");
  }
  if (workflowJob.if && !resolveWorkflowBoolean(workflowJob.if, baseContext, true)) {
    return await context.jobStepSupport.skipJob(input.run, input.jobRun, `Skipped by if condition for job ${input.jobRun.name}.`);
  }
  if (input.activeState.cancelRequested) {
    return await context.jobStepSupport.cancelJob(input.run, input.jobRun, "Cancelled before job start.");
  }
  try {
    context.jobStepSupport.assertJobRunnerSupported(input.jobRun);
    return null;
  } catch (error) {
    return await failUnsupportedJob(
      context,
      input.run,
      input.jobRun,
      error instanceof Error ? error.message : `Job ${input.jobRun.name} failed before start.`,
    );
  }
}

async function startJobExecution(context: RuntimeContext, input: ExecuteJobInput) {
  const workspaceRoot = resolveActionsWorkspaceRoot(context.options.actions, input.run.repository_id, input.run.id);
  const workspacePath = path.join(workspaceRoot, "jobs", input.jobRun.id, "workspace");
  await materializeJobWorkspace({
    commitHash: input.run.commit_hash,
    repositoryPath: input.repositoryPath,
    workspacePath,
  });
  const jobRun = await context.runtimeSupport.updateJob(input.run.id, input.jobRun.id, {
    runner: context.runner,
    started_at: nowIso(),
    status: "running",
    summary: `Running job ${input.jobRun.name}.`,
  });
  await context.runtimeSupport.updateRun(input.run.repository_id, input.run.id, {
    current_job: jobRun.name,
    current_job_id: jobRun.id,
    status: "running",
    summary: `Running job ${jobRun.name}.`,
  });
  await context.jobStepSupport.emitJobStarted(input.run, jobRun);
  return { jobRun, workspacePath };
}

function buildStepContext(
  context: RuntimeContext,
  input: ExecuteJobInput,
  workflowJob: GitForgeWorkflow["jobs"][number],
  jobRun: GitForgeWorkflowRunJob,
  baseContext: WorkflowExpressionContext,
  stepRun: GitForgeWorkflowRunStep,
) {
  return {
    ...baseContext,
    env: mergeRuntimeEnv({
      actions: context.options.actions,
      execution: input.execution,
      jobEnv: workflowJob.env,
      ...(input.jobRun.matrix ? { matrix: input.jobRun.matrix } : {}),
      run: input.run,
      stepEnv: normalizeEnv(stepRun.metadata?.env),
      triggerContext: normalizeTriggerContext(input.run.trigger_context),
      workflow: input.workflow,
    }),
    job: { status: jobRun.status },
  } satisfies WorkflowExpressionContext;
}

async function startStepExecution(
  context: RuntimeContext,
  run: GitForgeWorkflowRun,
  jobRun: GitForgeWorkflowRunJob,
  stepRun: GitForgeWorkflowRunStep,
) {
  const startedStep = await context.runtimeSupport.updateStep(run.id, stepRun.id, {
    started_at: nowIso(),
    status: "running",
  });
  const nextJobRun = await context.runtimeSupport.updateJob(run.id, jobRun.id, {
    current_step: startedStep.name,
    current_step_index: startedStep.index,
  });
  await context.runtimeSupport.updateRun(run.repository_id, run.id, {
    current_job: jobRun.name,
    current_job_id: jobRun.id,
    current_step: startedStep.name,
    current_step_index: startedStep.index,
    status: "running",
    summary: `Running ${jobRun.name} / ${startedStep.name}.`,
  });
  return { jobRun: nextJobRun, stepRun: startedStep };
}

async function emitStepStarted(
  context: RuntimeContext,
  run: GitForgeWorkflowRun,
  jobRun: GitForgeWorkflowRunJob,
  stepRun: GitForgeWorkflowRunStep,
  resolvedCommand: string,
  redactor: ReturnType<typeof createRunRedactor>,
) {
  await context.runtimeSupport.emitRunEvent(run, {
    command: await redactor(resolvedCommand),
    job_id: jobRun.job_id,
    job_name: jobRun.name,
    job_run_id: jobRun.id,
    status: "running",
    step_id: stepRun.id,
    step_index: stepRun.index,
    step_name: stepRun.name,
    type: "step.started",
  });
}

async function executeJobStep(
  context: RuntimeContext,
  input: ExecuteJobInput,
  workflowJob: GitForgeWorkflow["jobs"][number],
  baseContext: WorkflowExpressionContext,
  jobRun: GitForgeWorkflowRunJob,
  stepRun: GitForgeWorkflowRunStep,
  workspacePath: string,
) {
  if (input.activeState.cancelRequested) {
    await context.jobStepSupport.finishStep(input.run, jobRun, stepRun, {
      status: "cancelled",
      summary: `Cancelled before step ${stepRun.name}.`,
    });
    return jobRun;
  }
  const stepContext = buildStepContext(context, input, workflowJob, jobRun, baseContext, stepRun);
  const stepIf = text(stepRun.metadata?.if);
  if (stepIf && !resolveWorkflowBoolean(stepIf, stepContext, true)) {
    await context.jobStepSupport.finishStep(input.run, jobRun, stepRun, {
      status: "skipped",
      summary: `Skipped step ${stepRun.name}.`,
    });
    return jobRun;
  }
  const redactor = createRunRedactor({
    actions: context.options.actions,
    env: stepContext.env,
    run: input.run,
    secrets: input.execution.secrets,
    step: stepRun,
  });
  const resolvedCommand = stepRun.kind === "shell"
    ? resolveWorkflowString(stepRun.command, stepContext)
    : resolveWorkflowString(text(stepRun.uses), stepContext);
  const started = await startStepExecution(context, input.run, jobRun, stepRun);
  await emitStepStarted(context, input.run, started.jobRun, started.stepRun, resolvedCommand, redactor);
  return await executeStartedStep(
    context,
    input,
    workflowJob,
    started.jobRun,
    started.stepRun,
    workspacePath,
    stepContext,
    resolvedCommand,
    redactor,
  );
}

async function finalizeSuccessfulJob(
  context: RuntimeContext,
  run: GitForgeWorkflowRun,
  jobRun: GitForgeWorkflowRunJob,
) {
  const finishedJob = await context.runtimeSupport.updateJob(run.id, jobRun.id, {
    current_step: null,
    current_step_index: null,
    finished_at: nowIso(),
    status: "success",
    summary: `Job ${jobRun.name} completed successfully.`,
  });
  await context.jobStepSupport.emitJobFinished(run, finishedJob);
  return finishedJob;
}

function createJobExecutor(context: RuntimeContext) {
  return async (input: ExecuteJobInput) => {
    const workflowJob = readWorkflowJob(input.workflow, input.jobRun.job_id);
    const baseContext = buildBaseContext(input);
    const earlyResult = await resolvePreExecutionResult(context, input, workflowJob, baseContext);
    if (earlyResult) return earlyResult;
    let { jobRun, workspacePath } = await startJobExecution(context, input);
    const stepRuns = await context.storage.listWorkflowRunSteps(input.run.id, { jobRunId: jobRun.id });
    for (const stepRun of stepRuns) {
      jobRun = await executeJobStep(context, input, workflowJob, baseContext, jobRun, stepRun, workspacePath);
      if (isTerminalJobStatus(jobRun.status) && jobRun.status !== "running") return jobRun;
    }
    return await finalizeSuccessfulJob(context, input.run, jobRun);
  };
}

export type { ExecuteJobInput };
export { createJobExecutor };
