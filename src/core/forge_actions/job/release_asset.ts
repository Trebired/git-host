import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeActionsStorage,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunStep,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

import { publishReleaseAsset } from "#29rwdliqdi93";
import { resolveReleaseAssetsRoot } from "#134up1wv9uhu";
import { resolveGithubRef } from "#gc1rzxkbhrqu";

type ReleaseAssetContext = {
  emitRunEvent: (
    run: GitForgeWorkflowRun,
    input: Omit<import("#1mbdfxwwqqpa").GitForgeWorkflowRunEvent, "created_at" | "id" | "repository_id" | "run_id" | "sequence" | "workflow_id">,
  ) => Promise<import("#1mbdfxwwqqpa").GitForgeWorkflowRunEvent>;
  options: import("#gc1rzxkbhrqu").CreateGitForgeActionsRuntimeOptions;
};

function resolveReleaseAssetTag(run: GitForgeWorkflowRun, stepWith: Record<string, string>) {
  return text(
    stepWith.tag,
    text(resolveGithubRef(run)).replace(/^refs\/tags\//, "").replace(/^refs\/heads\//, ""),
  );
}

async function emitPublishedReleaseAssetEvent(context: ReleaseAssetContext, input: {
  asset: Awaited<ReturnType<typeof publishReleaseAsset>>["asset"];
  jobRun: GitForgeWorkflowRunJob;
  release: Awaited<ReturnType<typeof publishReleaseAsset>>["release"];
  run: GitForgeWorkflowRun;
  stepRun: GitForgeWorkflowRunStep;
}) {
  await context.emitRunEvent(input.run, {
    job_id: input.jobRun.job_id,
    job_name: input.jobRun.name,
    job_run_id: input.jobRun.id,
    metadata: {
      asset_id: input.asset.id,
      asset_name: input.asset.name,
      release_id: input.release.id,
      size: input.asset.size,
      tag_name: input.release.tag_name,
    },
    status: "success",
    step_id: input.stepRun.id,
    step_index: input.stepRun.index,
    step_name: input.stepRun.name,
    summary: `Published release asset ${input.asset.name}.`,
    type: "release_asset.published",
  });
}

async function executePublishReleaseAssetStep(context: ReleaseAssetContext, input: {
  jobRun: GitForgeWorkflowRunJob;
  run: GitForgeWorkflowRun;
  stepRun: GitForgeWorkflowRunStep;
  stepWith: Record<string, string>;
  workspacePath: string;
}) {
  const assetName = text(input.stepWith.name);
  const pathSpec = text(input.stepWith.path);
  const format = text(input.stepWith.format, "tar.gz") === "zip" ? "zip" : "tar.gz";
  if (!assetName || !pathSpec) {
    throw new GitHostError("forge_actions_runner_failed", "actions/publish-release-asset requires with.name and with.path.", {
      uses: input.stepRun.uses,
    });
  }
  const tagName = resolveReleaseAssetTag(input.run, input.stepWith);
  if (!tagName) {
    throw new GitHostError("forge_actions_runner_failed", "actions/publish-release-asset could not resolve a tag name; pass with.tag explicitly.", {
      uses: input.stepRun.uses,
    });
  }
  const { asset, release } = await publishReleaseAsset({
    assetName,
    format,
    releaseAssetsRoot: resolveReleaseAssetsRoot(context.options.actions),
    releaseId: text(input.run.release_id) || undefined,
    releases: context.options.releases,
    repositoryId: input.run.repository_id,
    sourcePath: path.resolve(input.workspacePath, pathSpec),
    tagName,
  });
  await emitPublishedReleaseAssetEvent(context, { asset, jobRun: input.jobRun, release, run: input.run, stepRun: input.stepRun });
  return {
    outputPreview: `Published release asset ${asset.name} to release ${release.tag_name}.\n`,
    summary: `Published release asset ${asset.name}.`,
  };
}

export { executePublishReleaseAssetStep };
