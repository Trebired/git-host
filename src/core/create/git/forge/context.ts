import { randomUUID } from "node:crypto";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { GitHostError } from "#8974ac53d713";
import { resolveLogger } from "#5a29135e56c1";
import type {
  CreateGitForgeOptions,
  GitForge,
  GitForgeActivityEntry,
  GitForgeActivityKind,
  GitForgeActor,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetLink,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import { createGitForgeActivityRecorder } from "#yotdvtav6ika";
import { createGitForgeActionsRuntime } from "#1hvsns0vce55";
import { countDistinct, nowIso } from "./shared.js";

type GitForgeRuntimeContext = {
  actions: ReturnType<typeof createGitForgeActionsRuntime> | null;
  activityRecorder: ReturnType<typeof createGitForgeActivityRecorder>;
  logger: ReturnType<typeof resolveLogger>;
  logGroup: string;
  options: CreateGitForgeOptions;
  readOverview(repositoryId: string, actorId?: string): Promise<GitForgeRepositoryOverview>;
  readRequiredFork(forkRepositoryId: string): Promise<Awaited<ReturnType<CreateGitForgeOptions["storage"]["forks"]["readFork"]>>>;
  readRequiredRelease(repositoryId: string, releaseId: string): Promise<GitForgeRelease>;
  readRequiredReleaseAsset(release: GitForgeRelease, assetId: string): GitForgeReleaseAsset;
  readSocialState(repositoryId: string, actorId?: string): Promise<GitForgeSocialState>;
  recordActivity(repositoryId: string, actor: GitForgeActor, kind: GitForgeActivityKind, metadata?: Record<string, unknown>): Promise<GitForgeActivityEntry>;
  resolveReleaseAssetLinkInternal(repositoryId: string, release: GitForgeRelease, asset: GitForgeReleaseAsset, repositoryKey?: string): Promise<GitForgeReleaseAssetLink>;
  verbose: boolean;
};

function validateCreateGitForgeOptions(options: CreateGitForgeOptions) {
  if (!options || typeof options.gitHost !== "object") throw new TypeError("createGitForge() requires a gitHost instance.");
  if (!options.storage || typeof options.storage !== "object") throw new TypeError("createGitForge() requires a storage adapter.");
  if (typeof options.createForkRepository !== "function") throw new TypeError("createGitForge() requires createForkRepository().");
}

function createActionsRuntime(options: CreateGitForgeOptions) {
  return options.storage.actions
    ? createGitForgeActionsRuntime({
      actions: options.actions,
      gitHost: options.gitHost,
      releases: options.storage.releases,
      storage: options.storage.actions,
    })
    : null;
}

function createRecordActivity(activityRecorder: ReturnType<typeof createGitForgeActivityRecorder>) {
  return async (repositoryId: string, actor: GitForgeActor, kind: GitForgeActivityKind, metadata: Record<string, unknown> = {}) => (
    await activityRecorder.recordActivity({
      actor_id: actor.id,
      actor_label: text(actor.name, actor.id),
      created_at: nowIso(),
      kind,
      metadata,
      repository_id: repositoryId,
      source: "forge",
    })
  );
}

function createReadSocialState(options: CreateGitForgeOptions) {
  return async (repositoryId: string, actorId?: string): Promise<GitForgeSocialState> => {
    const [stars, watchers, viewerHasStarred, viewerIsWatching] = await Promise.all([
      options.storage.social.listStars ? options.storage.social.listStars(repositoryId) : Promise.resolve([]),
      options.storage.social.listWatchers ? options.storage.social.listWatchers(repositoryId) : Promise.resolve([]),
      actorId ? options.storage.social.viewerHasStarred(repositoryId, actorId) : Promise.resolve(false),
      actorId ? options.storage.social.viewerIsWatching(repositoryId, actorId) : Promise.resolve(false),
    ]);
    return {
      repository_id: repositoryId,
      star_count: await countDistinct(stars),
      viewer_has_starred: viewerHasStarred,
      viewer_is_watching: viewerIsWatching,
      watcher_count: await countDistinct(watchers),
    };
  };
}

function createReadOverview(
  options: CreateGitForgeOptions,
  activityRecorder: ReturnType<typeof createGitForgeActivityRecorder>,
  readSocialState: GitForgeRuntimeContext["readSocialState"],
) {
  return async (repositoryId: string, actorId?: string): Promise<GitForgeRepositoryOverview> => {
    const [repository, releases, forks, activity, social] = await Promise.all([
      options.gitHost.readSummary(repositoryId),
      options.storage.releases.listReleases(repositoryId),
      options.storage.forks.listForks(repositoryId),
      activityRecorder.listActivity(repositoryId),
      readSocialState(repositoryId, actorId),
    ]);
    const sortedReleases = Array.from(releases).sort((left, right) => text(right.published_at || right.created_at).localeCompare(text(left.published_at || left.created_at)));
    return {
      activity_count: activity.length,
      fork_count: forks.length,
      latest_release: sortedReleases[0] || null,
      release_count: sortedReleases.length,
      repository,
      social,
    };
  };
}

function createReadRequiredRelease(options: CreateGitForgeOptions) {
  return async (repositoryId: string, releaseId: string): Promise<GitForgeRelease> => {
    const release = await options.storage.releases.readRelease(repositoryId, releaseId);
    if (!release) {
      throw new GitHostError("forge_resource_not_found", `Release "${releaseId}" was not found.`, {
        releaseId,
        repositoryId,
      });
    }
    return release;
  };
}

function readRequiredReleaseAsset(release: GitForgeRelease, assetId: string): GitForgeReleaseAsset {
  const asset = release.assets.find((entry) => text(entry.id) === text(assetId));
  if (!asset) {
    throw new GitHostError("forge_resource_not_found", `Release asset "${assetId}" was not found in release "${release.id}".`, {
      assetId,
      releaseId: release.id,
      repositoryId: release.repository_id,
    });
  }
  return asset;
}

function createResolveReleaseAssetLinkInternal(options: CreateGitForgeOptions) {
  return async (repositoryId: string, release: GitForgeRelease, asset: GitForgeReleaseAsset, repositoryKey?: string): Promise<GitForgeReleaseAssetLink> => {
    const href = text(
      options.releaseAssetStore?.buildAssetDownloadUrl?.({ asset, release, repositoryId, repositoryKey }),
      text(asset.download_url, `/repositories/${encodeURIComponent(text(repositoryKey, repositoryId))}/releases/${encodeURIComponent(release.id)}/assets/${encodeURIComponent(asset.id)}`),
    );
    return {
      asset_id: asset.id,
      content_type: asset.content_type,
      file_name: text(asset.name, `asset-${asset.id}`),
      href,
      size: asset.size == null ? null : Number(asset.size) || 0,
    };
  };
}

function createReadRequiredFork(options: CreateGitForgeOptions) {
  return async (forkRepositoryId: string) => {
    const fork = await options.storage.forks.readFork(forkRepositoryId);
    if (!fork) {
      throw new GitHostError("forge_resource_not_found", `Fork "${forkRepositoryId}" was not found.`, {
        forkRepositoryId,
      });
    }
    return fork;
  };
}

function createGitForgeContext(options: CreateGitForgeOptions): GitForgeRuntimeContext {
  validateCreateGitForgeOptions(options);
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const logGroup = "trebired.git-host.forge";
  const verbose = options.verbose === true;
  const activityRecorder = createGitForgeActivityRecorder({ storage: options.storage.activity });
  const actions = createActionsRuntime(options);
  if (actions) actions.bindActivityStorage(options.storage.activity);
  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: logGroup,
    logger: options.logger,
    source: "@trebired/git-host",
  });
  const recordActivity = createRecordActivity(activityRecorder);
  const readSocialState = createReadSocialState(options);
  return {
    actions,
    activityRecorder,
    logger,
    logGroup,
    options,
    readOverview: createReadOverview(options, activityRecorder, readSocialState),
    readRequiredFork: createReadRequiredFork(options),
    readRequiredRelease: createReadRequiredRelease(options),
    readRequiredReleaseAsset,
    readSocialState,
    recordActivity,
    resolveReleaseAssetLinkInternal: createResolveReleaseAssetLinkInternal(options),
    verbose,
  };
}

function createReleaseSeed(repositoryId: string, actor: GitForgeActor, input: CreateGitForgeOptions["storage"]["releases"] extends never ? never : any, tagName: string, targetRef: string, assets: GitForgeReleaseAsset[]) {
  const createdAt = nowIso();
  return {
    assets,
    author_id: actor.id,
    created_at: createdAt,
    draft: input.draft === true,
    id: randomUUID(),
    notes: text(input.notes),
    prerelease: input.prerelease === true,
    published_at: input.draft === true ? null : (input.publishedAt === null ? null : text(input.publishedAt, createdAt)),
    repository_id: repositoryId,
    tag_name: tagName,
    target_ref: targetRef,
    title: text(input.title, tagName),
    updated_at: createdAt,
  } satisfies GitForgeRelease;
}

export { createGitForgeContext, createReleaseSeed };
export type { GitForgeRuntimeContext };
