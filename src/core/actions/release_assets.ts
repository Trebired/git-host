import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseStorage,
} from "#g3n8cscehpt3";
import { text } from "#62f869522d1f";

type ReleaseAssetArchiveFormat = "tar.gz" | "zip";

function sanitizeAssetFileNameComponent(value: string) {
  const next = text(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return next || "asset";
}

function releaseAssetStoragePath(input: {
  assetId: string;
  fileName: string;
  releaseAssetsRoot: string;
  releaseId: string;
  repositoryId: string;
}) {
  return path.join(
    input.releaseAssetsRoot,
    input.repositoryId,
    input.releaseId,
    `${input.assetId}-${sanitizeAssetFileNameComponent(input.fileName)}`,
  );
}

function archiveContentType(format: ReleaseAssetArchiveFormat) {
  return format === "zip" ? "application/zip" : "application/gzip";
}

function shellQuotePosix(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function runArchiveCommand(command: string): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-lc", command], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: typeof code === "number" ? code : 1, stderr }));
  });
}

async function compressDirectoryToArchive(input: {
  destinationPath: string;
  format: ReleaseAssetArchiveFormat;
  sourcePath: string;
}) {
  if (!fs.existsSync(input.sourcePath)) {
    throw new GitHostError("forge_actions_runner_failed", `Path "${input.sourcePath}" does not exist.`, {
      sourcePath: input.sourcePath,
    });
  }
  fs.mkdirSync(path.dirname(input.destinationPath), { recursive: true });
  fs.rmSync(input.destinationPath, { force: true });

  const parentDir = path.dirname(input.sourcePath);
  const baseName = path.basename(input.sourcePath);
  const command = input.format === "zip"
    ? `cd ${shellQuotePosix(parentDir)} && zip -rq ${shellQuotePosix(input.destinationPath)} ${shellQuotePosix(baseName)}`
    : `tar -czf ${shellQuotePosix(input.destinationPath)} -C ${shellQuotePosix(parentDir)} ${shellQuotePosix(baseName)}`;

  const result = await runArchiveCommand(command);
  if (result.exitCode !== 0 || !fs.existsSync(input.destinationPath)) {
    throw new GitHostError("forge_actions_runner_failed", `Failed to create ${input.format} archive for release asset.`, {
      destinationPath: input.destinationPath,
      exitCode: result.exitCode,
      sourcePath: input.sourcePath,
      stderr: result.stderr,
    });
  }
  return { size: fs.statSync(input.destinationPath).size };
}

async function findReleaseByTag(releases: GitForgeReleaseStorage, repositoryId: string, tagName: string) {
  const existing = await releases.listReleases(repositoryId);
  return existing.find((release) => release.tag_name === tagName) || null;
}

// The actions runtime only has the raw release storage, not the orchestrated
// GitForge.createRelease() (which validates actors, creates the git tag, resolves
// target_ref, and runs the host's normalizeAssets hook) — that method lives one
// layer up and isn't constructed yet when the actions runtime is wired together.
// Rather than half-reimplement release creation here with a worse-validated path,
// this step requires the release to already exist: either create it first (via the
// release UI/API, which is also what a `release.create`-triggered workflow already
// has), or trigger this workflow from `release.create` so `github.event.release_id`
// is populated automatically.
async function resolveTargetRelease(input: {
  releaseId?: string;
  releases: GitForgeReleaseStorage;
  repositoryId: string;
  tagName: string;
}): Promise<GitForgeRelease> {
  if (input.releaseId) {
    const byId = await input.releases.readRelease(input.repositoryId, input.releaseId);
    if (byId) return byId;
  }
  const byTag = await findReleaseByTag(input.releases, input.repositoryId, input.tagName);
  if (byTag) return byTag;
  throw new GitHostError(
    "forge_actions_runner_failed",
    `No release exists for tag "${input.tagName}". Create the release first, then re-run, or trigger this workflow from a release.create event.`,
    { repositoryId: input.repositoryId, tagName: input.tagName },
  );
}

async function publishReleaseAsset(input: {
  assetName: string;
  format: ReleaseAssetArchiveFormat;
  releaseAssetsRoot: string;
  releaseId?: string;
  releases: GitForgeReleaseStorage;
  repositoryId: string;
  sourcePath: string;
  tagName: string;
}): Promise<{ asset: GitForgeReleaseAsset; release: GitForgeRelease }> {
  const release = await resolveTargetRelease({
    releaseId: input.releaseId,
    releases: input.releases,
    repositoryId: input.repositoryId,
    tagName: input.tagName,
  });

  const assetId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `${input.assetName}${input.format === "zip" ? ".zip" : ".tar.gz"}`;
  const destinationPath = releaseAssetStoragePath({
    assetId,
    fileName,
    releaseAssetsRoot: input.releaseAssetsRoot,
    releaseId: release.id,
    repositoryId: input.repositoryId,
  });

  const compressed = await compressDirectoryToArchive({
    destinationPath,
    format: input.format,
    sourcePath: input.sourcePath,
  });

  const asset: GitForgeReleaseAsset = {
    content_type: archiveContentType(input.format),
    id: assetId,
    name: fileName,
    size: compressed.size,
    storage_pointer: destinationPath,
  };

  const updated = await input.releases.updateRelease(input.repositoryId, release.id, {
    assets: [...release.assets.filter((existing) => existing.name !== fileName), asset],
    updated_at: new Date().toISOString(),
  });

  return { asset, release: updated || { ...release, assets: [...release.assets, asset] } };
}

export {
  compressDirectoryToArchive,
  publishReleaseAsset,
  releaseAssetStoragePath,
};
