import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeReleaseInput,
  DeleteGitForgeReleaseInput,
  GitForge,
  GitForgeRelease,
  GitForgeReleaseAssetDownload,
  UpdateGitForgeReleaseInput,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import { assertActor } from "./shared.js";
import { createReleaseSeed } from "./context.js";
import type { GitForgeRuntimeContext } from "./context.js";

async function normalizeReleaseAssets(context: GitForgeRuntimeContext, repositoryId: string, assets: unknown) {
  if (!context.options.releaseAssetStore?.normalizeAssets) return Array.isArray(assets) ? assets : [];
  return await context.options.releaseAssetStore.normalizeAssets(repositoryId, Array.isArray(assets) ? assets : []);
}

async function readReleaseAssetDownload(
  context: GitForgeRuntimeContext,
  repositoryId: string,
  release: GitForgeRelease,
  asset: GitForgeRelease["assets"][number],
  repositoryKey: string,
): Promise<GitForgeReleaseAssetDownload | null> {
  return context.options.releaseAssetStore?.openAssetDownload
    ? await context.options.releaseAssetStore.openAssetDownload({ asset, release, repositoryId, repositoryKey })
    : null;
}

function createReleaseMethods(context: GitForgeRuntimeContext): Pick<GitForge,
  "createRelease" | "deleteRelease" | "listReleases" | "openReleaseAsset" | "readRelease" | "resolveReleaseAssetLink" | "updateRelease"
> {
  return {
    async listReleases(repositoryId: string) {
      const releases = await context.options.storage.releases.listReleases(repositoryId);
      return Array.from(releases).sort((left, right) => text(right.published_at || right.created_at).localeCompare(text(left.published_at || left.created_at)));
    },
    async readRelease(repositoryId: string, releaseId: string) {
      return await context.readRequiredRelease(repositoryId, releaseId);
    },
    async resolveReleaseAssetLink(repositoryId: string, releaseId: string, assetId: string, input = {}) {
      const release = await context.readRequiredRelease(repositoryId, releaseId);
      const asset = context.readRequiredReleaseAsset(release, assetId);
      return await context.resolveReleaseAssetLinkInternal(repositoryId, release, asset, text(input.repositoryKey));
    },
    async openReleaseAsset(repositoryId: string, releaseId: string, assetId: string, input = {}) {
      const release = await context.readRequiredRelease(repositoryId, releaseId);
      const asset = context.readRequiredReleaseAsset(release, assetId);
      const repositoryKey = text(input.repositoryKey);
      const download = await readReleaseAssetDownload(context, repositoryId, release, asset, repositoryKey);
      if (!download) {
        const link = await context.resolveReleaseAssetLinkInternal(repositoryId, release, asset, repositoryKey);
        return {
          asset,
          content_type: text(asset.content_type, "application/octet-stream"),
          file_name: link.file_name,
          redirect_url: link.href,
          size: link.size,
        };
      }
      return {
        ...download,
        asset: { ...asset, download_url: text(download.redirect_url, asset.download_url) },
        content_type: text(download.content_type, text(asset.content_type, "application/octet-stream")),
        file_name: text(download.file_name, text(asset.name, `asset-${asset.id}`)),
        size: download.size == null ? (asset.size == null ? null : Number(asset.size) || 0) : download.size,
      };
    },
    async createRelease(repositoryId: string, input: CreateGitForgeReleaseInput) {
      const actor = assertActor(input.actor);
      const existingTagName = text(input.existingTagName);
      if (!existingTagName && !input.createTag) throw new GitHostError("forge_invalid_input", "A release requires either existingTagName or createTag.", { repositoryId });
      const tagState = await ensureReleaseTag(context, repositoryId, actor, input);
      const assets = await normalizeReleaseAssets(context, repositoryId, input.assets);
      const release = createReleaseSeed(repositoryId, actor, input, tagState.tagName, tagState.targetRef, assets);
      const created = await context.options.storage.releases.createRelease(release);
      await context.recordActivity(repositoryId, actor, "release.create", { release_id: created.id, tag_name: created.tag_name });
      return created;
    },
    async updateRelease(repositoryId: string, releaseId: string, input: UpdateGitForgeReleaseInput) {
      const actor = assertActor(input.actor);
      await context.readRequiredRelease(repositoryId, releaseId);
      const assets = context.options.releaseAssetStore?.normalizeAssets
        ? await context.options.releaseAssetStore.normalizeAssets(repositoryId, Array.isArray(input.assets) ? input.assets : [])
        : input.assets;
      const updated = await context.options.storage.releases.updateRelease(repositoryId, releaseId, {
        ...(Array.isArray(assets) ? { assets } : {}),
        ...(input.draft != null ? { draft: input.draft === true } : {}),
        ...(input.notes != null ? { notes: text(input.notes) } : {}),
        ...(input.prerelease != null ? { prerelease: input.prerelease === true } : {}),
        ...(input.publishedAt !== undefined ? { published_at: input.publishedAt === null ? null : text(input.publishedAt) } : {}),
        ...(input.title != null ? { title: text(input.title) } : {}),
        updated_at: new Date().toISOString(),
      });
      if (!updated) throw new GitHostError("forge_resource_not_found", `Release "${releaseId}" was not found.`, { releaseId, repositoryId });
      await context.recordActivity(repositoryId, actor, "release.update", { release_id: releaseId });
      return updated;
    },
    async deleteRelease(repositoryId: string, releaseId: string, input: DeleteGitForgeReleaseInput) {
      const actor = assertActor(input.actor);
      const existing = await context.readRequiredRelease(repositoryId, releaseId);
      const deleted = await context.options.storage.releases.deleteRelease(repositoryId, releaseId);
      if (!deleted) throw new GitHostError("forge_resource_not_found", `Release "${releaseId}" was not found.`, { releaseId, repositoryId });
      if (input.deleteTag === true) await context.options.gitHost.deleteTag(repositoryId, { name: existing.tag_name });
      await context.recordActivity(repositoryId, actor, "release.delete", { release_id: releaseId, tag_name: existing.tag_name });
    },
  };
}

async function ensureReleaseTag(
  context: GitForgeRuntimeContext,
  repositoryId: string,
  actor: ReturnType<typeof assertActor>,
  input: CreateGitForgeReleaseInput,
) {
  let tagName = text(input.existingTagName);
  let targetRef = "";
  if (input.createTag) {
    tagName = text(input.createTag.name);
    targetRef = text(input.createTag.targetRef, "HEAD");
    await context.options.gitHost.createTag(repositoryId, {
      actor: { email: actor.email, id: actor.id, name: actor.name },
      message: text(input.createTag.annotatedMessage),
      name: tagName,
      ref: targetRef,
    });
  }
  const tagDetail = await context.options.gitHost.readTag(repositoryId, tagName);
  return {
    tagName,
    targetRef: targetRef || text(tagDetail.target_hash),
  };
}

export { createReleaseMethods };
