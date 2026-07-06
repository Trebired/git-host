import { randomUUID } from "node:crypto";

import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeActionsStorage,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepStatus,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { downloadArtifact, uploadArtifact } from "#rl6fo497d2h3";
import { setupRuntime } from "#x2bn6ub493ck";
import { executePublishReleaseAssetStep } from "./release_asset.js";
import { nowIso, resolveGithubRef } from "#gc1rzxkbhrqu";

type JobStepSupportContext = {
  emitRunEvent: (
    run: GitForgeWorkflowRun,
    input: Omit<import("#1mbdfxwwqqpa").GitForgeWorkflowRunEvent, "created_at" | "id" | "repository_id" | "run_id" | "sequence" | "workflow_id">,
  ) => Promise<GitForgeWorkflowRun["id"] extends string ? any : never>;
  markQueuedStepsForJob: (runId: string, jobRunId: string, status: Extract<GitForgeWorkflowRunStepStatus, "cancelled" | "skipped">) => Promise<void>;
  options: import("#gc1rzxkbhrqu").CreateGitForgeActionsRuntimeOptions;
  runner: ReturnType<typeof import("#gc1rzxkbhrqu").normalizeRunner>;
  storage: GitForgeActionsStorage;
  updateJob: (runId: string, jobRunId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunJob"]>[2]) => Promise<GitForgeWorkflowRunJob>;
  updateStep: (runId: string, stepId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunStep"]>[2]) => Promise<GitForgeWorkflowRunStep>;
};

function supportedRunnerLabels(runner: ReturnType<typeof import("#gc1rzxkbhrqu").normalizeRunner>) {
  return new Set(runner.labels || []);
}

function assertJobRunnerSupported(runner: ReturnType<typeof import("#gc1rzxkbhrqu").normalizeRunner>, jobRun: GitForgeWorkflowRunJob) {
  const labels = supportedRunnerLabels(runner);
  const unsupported = jobRun.runs_on.filter((entry) => !labels.has(text(entry)));
  if (unsupported.length) {
    throw new GitHostError("forge_actions_runner_failed", `Job "${jobRun.name}" requested unsupported runner labels: ${unsupported.join(", ")}.`, {
      jobRunId: jobRun.id,
      labels: unsupported,
    });
  }
}

function createEmitJobStarted(
  emitRunEvent: JobStepSupportContext["emitRunEvent"],
) {
  return async (run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob) => {
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
  return async (run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob) => {
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
  return async (
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
  };
}

function createSkipJob(context: JobStepSupportContext, emitJobFinished: ReturnType<typeof createEmitJobFinished>) {
  return async (run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob, summary: string) => {
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

function createCancelJob(context: JobStepSupportContext, emitJobFinished: ReturnType<typeof createEmitJobFinished>) {
  return async (run: GitForgeWorkflowRun, jobRun: GitForgeWorkflowRunJob, summary: string) => {
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

function createUsesDispatcher(context: JobStepSupportContext) {
  return async (input: {
    artifactsRoot: string;
    execution: import("#gc1rzxkbhrqu").ResolvedExecutionContext;
    jobRun: GitForgeWorkflowRunJob;
    run: GitForgeWorkflowRun;
    stepWith: Record<string, string>;
    stepRun: GitForgeWorkflowRunStep;
    workspacePath: string;
  }) => {
    const uses = text(input.stepRun.uses);
    if (uses === "actions/checkout" || uses === "actions/checkout@v4") return executeCheckoutStep(input);
    if (uses === "actions/setup-node" || uses === "actions/setup-node@v4") return await executeRuntimeSetup("node", input.workspacePath);
    if (uses === "oven-sh/setup-bun" || uses === "oven-sh/setup-bun@v2") return await executeRuntimeSetup("bun", input.workspacePath);
    if (uses === "actions/upload-artifact" || uses === "actions/upload-artifact@v4") return await executeUploadArtifactStep(context, input, uses);
    if (uses === "actions/download-artifact" || uses === "actions/download-artifact@v4") return await executeDownloadArtifactStep(context, input, uses);
    if (uses === "actions/publish-release-asset" || uses === "actions/publish-release-asset@v1") return await executePublishReleaseAssetStep(context, input);
    throw new GitHostError("forge_actions_runner_failed", `Unsupported action "${uses}".`, { uses });
  };
}

function executeCheckoutStep(input: {
  run: GitForgeWorkflowRun;
  stepWith: Record<string, string>;
}) {
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

async function executeRuntimeSetup(kind: "bun" | "node", workspacePath: string) {
  const version = await setupRuntime(kind, workspacePath);
  return {
    outputPreview: text(version.stdout, version.stderr),
    summary: `${kind === "node" ? "Node" : "Bun"} runtime is available.`,
  };
}

async function executeUploadArtifactStep(
  context: JobStepSupportContext,
  input: {
    artifactsRoot: string;
    jobRun: GitForgeWorkflowRunJob;
    run: GitForgeWorkflowRun;
    stepWith: Record<string, string>;
    stepRun: GitForgeWorkflowRunStep;
    workspacePath: string;
  },
  uses: string,
) {
  const artifactName = text(input.stepWith.name);
  const pathSpec = text(input.stepWith.path);
  if (!artifactName || !pathSpec) {
    throw new GitHostError("forge_actions_runner_failed", "actions/upload-artifact requires with.name and with.path.", { uses });
  }
  const stored = uploadArtifact({ artifactName, artifactsRoot: input.artifactsRoot, pathSpec, workspacePath: input.workspacePath });
  const artifact = await context.storage.createWorkflowRunArtifact({
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
  await context.emitRunEvent(input.run, {
    artifact_id: artifact.id,
    artifact_name: artifact.name,
    job_id: input.jobRun.job_id,
    job_name: input.jobRun.name,
    job_run_id: input.jobRun.id,
    metadata: { file_count: artifact.file_count, size: artifact.size },
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

async function executeDownloadArtifactStep(
  context: JobStepSupportContext,
  input: {
    artifactsRoot: string;
    jobRun: GitForgeWorkflowRunJob;
    run: GitForgeWorkflowRun;
    stepWith: Record<string, string>;
    stepRun: GitForgeWorkflowRunStep;
    workspacePath: string;
  },
  uses: string,
) {
  const artifactName = text(input.stepWith.name);
  if (!artifactName) {
    throw new GitHostError("forge_actions_runner_failed", "actions/download-artifact requires with.name.", { uses });
  }
  const artifacts = await context.storage.listWorkflowRunArtifacts(input.run.id, { name: artifactName });
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
  await context.emitRunEvent(input.run, {
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

function createJobStepSupport(context: JobStepSupportContext) {
  const emitJobStarted = createEmitJobStarted(context.emitRunEvent);
  const emitJobFinished = createEmitJobFinished(context.emitRunEvent);
  return {
    assertJobRunnerSupported: (jobRun: GitForgeWorkflowRunJob) => assertJobRunnerSupported(context.runner, jobRun),
    cancelJob: createCancelJob(context, emitJobFinished),
    emitJobFinished,
    emitJobStarted,
    executeUsesStep: createUsesDispatcher(context),
    finishStep: createFinishStep(context.updateStep, context.emitRunEvent),
    skipJob: createSkipJob(context, emitJobFinished),
  };
}

export { createJobStepSupport };
