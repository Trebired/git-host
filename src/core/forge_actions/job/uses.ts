import { randomUUID } from "node:crypto";

import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeWorkflowRun,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunStep,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { downloadArtifact, uploadArtifact } from "#rl6fo497d2h3";
import { setupRuntime } from "#x2bn6ub493ck";
import { nowIso, resolveGithubRef } from "#gc1rzxkbhrqu";
import { executePublishReleaseAssetStep } from "./release_asset.js";
import type { JobStepSupportContext } from "./context.js";

type UsesStepInput = {
  artifactsRoot: string;
  execution: import("#gc1rzxkbhrqu").ResolvedExecutionContext;
  jobRun: GitForgeWorkflowRunJob;
  run: GitForgeWorkflowRun;
  stepWith: Record<string, string>;
  stepRun: GitForgeWorkflowRunStep;
  workspacePath: string;
};

function createUsesDispatcher(context: JobStepSupportContext) {
  return async(input: UsesStepInput) => {
    const uses = text(input.stepRun.uses);
    if (uses === "actions/checkout" || uses === "actions/checkout@v4")
    return executeCheckoutStep(input);
    if (uses === "actions/setup-node" || uses === "actions/setup-node@v4")
    return await executeRuntimeSetup("node", input.workspacePath);
    if (uses === "oven-sh/setup-bun" || uses === "oven-sh/setup-bun@v2")
    return await executeRuntimeSetup("bun", input.workspacePath);
    if (
      uses === "actions/upload-artifact" ||
        uses === "actions/upload-artifact@v4"
    )
    return await executeUploadArtifactStep(context, input, uses);
    if (
      uses === "actions/download-artifact" ||
        uses === "actions/download-artifact@v4"
    )
    return await executeDownloadArtifactStep(context, input, uses);
    if (
      uses === "actions/publish-release-asset" ||
        uses === "actions/publish-release-asset@v1"
    )
    return await executePublishReleaseAssetStep(context, input);
    throw new GitHostError(
      "forge_actions_runner_failed",
      `Unsupported action "${uses}".`,
      { uses },
    );
  };
}

function executeCheckoutStep(input: {
    run: GitForgeWorkflowRun;
    stepWith: Record<string, string>;
}) {
  const targetRef = text(input.stepWith.ref);
  const targetPath = text(input.stepWith.path, ".");
  if (
    targetRef &&
      targetRef !== input.run.ref &&
      targetRef !== resolveGithubRef(input.run)
  ) {
    throw new GitHostError(
      "forge_actions_runner_failed",
      "actions/checkout only supports the workflow snapshot ref in v1.",
      {
        requestedRef: targetRef,
        runRef: input.run.ref,
      },
    );
  }
  if (targetPath && targetPath !== ".") {
    throw new GitHostError(
      "forge_actions_runner_failed",
      "actions/checkout path overrides are not supported in v1.",
      {
        path: targetPath,
      },
    );
  }
  return {
    outputPreview: "Checked out workflow snapshot.\n",
    summary: "Checked out workflow snapshot.",
  };
}

async function executeRuntimeSetup(
  kind: "bun" | "node",
  workspacePath: string,
) {
  const version = await setupRuntime(kind, workspacePath);
  return {
    outputPreview: text(version.stdout, version.stderr),
    summary: `${kind === "node" ? "Node" : "Bun"} runtime is available.`,
  };
}

async function executeUploadArtifactStep(
  context: JobStepSupportContext,
  input: UsesStepInput,
  uses: string,
) {
  const artifactName = text(input.stepWith.name);
  const pathSpec = text(input.stepWith.path);
  if (!artifactName || !pathSpec) {
    throw new GitHostError(
      "forge_actions_runner_failed",
      "actions/upload-artifact requires with.name and with.path.",
      { uses },
    );
  }
  const stored = uploadArtifact({
      artifactName,
      artifactsRoot: input.artifactsRoot,
      pathSpec,
      workspacePath: input.workspacePath,
  });
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
  input: UsesStepInput,
  uses: string,
) {
  const artifactName = text(input.stepWith.name);
  if (!artifactName) {
    throw new GitHostError(
      "forge_actions_runner_failed",
      "actions/download-artifact requires with.name.",
      { uses },
    );
  }
  const artifacts = await context.storage.listWorkflowRunArtifacts(
    input.run.id,
    { name: artifactName },
  );
  const artifact = artifacts[0];
  if (!artifact) {
    throw new GitHostError(
      "forge_actions_runner_failed",
      `Artifact "${artifactName}" was not found for this run.`,
      {
        artifactName,
        runId: input.run.id,
      },
    );
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

export { createUsesDispatcher };
