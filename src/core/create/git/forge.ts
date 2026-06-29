import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { GitHostError } from "#8974ac53d713";
import { resolveLogger } from "#5a29135e56c1";
import type {
  CancelGitForgeWorkflowRunInput,
  CreateGitForgeForkInput,
  CreateGitForgeOptions,
  CreateGitForgeReleaseInput,
  DeleteGitForgeReleaseInput,
  GitForge,
  GitForgeActivityEntry,
  GitForgeActivityKind,
  GitForgeActor,
  GitForgeFork,
  GitForgeForkStatus,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetDownload,
  GitForgeReleaseAssetLink,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitRepositoryHandle,
  RunGitForgeWorkflowInput,
  SyncGitForgeForkInput,
  UpdateGitForgeReleaseInput,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import { fetchRepository } from "#1a2e563ea829";
import { createGitForgeActivityRecorder } from "../../activity.js";
import { createGitForgeActionsRuntime } from "../../forge_actions.js";
import { buildGitEnv, cloneRepository, ensureHostedRepositoryConfig, repositoryExists, runGit } from "#96b00569f1f4";

function repositoryHandleFromSummary(summary: GitForgeRepositoryOverview["repository"]): GitRepositoryHandle {
  return {
    id: summary.repository.id,
    path: summary.repository.path,
  };
}

function assertActor(actor: GitForgeActor | undefined | null): GitForgeActor {
  if (!actor || !text(actor.id)) {
    throw new GitHostError("forge_invalid_actor", "A stable actor id is required for forge mutations.");
  }

  return {
    ...actor,
    id: text(actor.id),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function countDistinct(values: string[] | undefined | null): Promise<number> {
  return new Set((values || []).map((value) => text(value)).filter(Boolean)).size;
}

async function readForkStatus(forkRepository: GitRepositoryHandle, upstreamRepository: GitRepositoryHandle, upstreamBranch: string): Promise<GitForgeForkStatus> {
  const hasFork = await repositoryExists(forkRepository.path);
  if (!hasFork) {
    throw new GitHostError("repository_not_initialized", `Repository "${forkRepository.id}" is not initialized.`, {
      path: forkRepository.path,
      repositoryId: forkRepository.id,
    });
  }

  await ensureUpstreamRemote(forkRepository, upstreamRepository.path);
  await fetchRepository(forkRepository, { remote: "upstream" });

  const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: forkRepository.path });
  if (!branchRes.ok) {
    throw new GitHostError("git_command_failed", text(branchRes.stderr, "Failed to resolve the fork branch."), {
      repositoryId: forkRepository.id,
    });
  }
  const forkBranch = text(branchRes.stdout);
  const compareRes = await runGit(["rev-list", "--left-right", "--count", `${forkBranch}...upstream/${upstreamBranch}`], {
    cwd: forkRepository.path,
  });
  if (!compareRes.ok) {
    throw new GitHostError("git_command_failed", text(compareRes.stderr, "Failed to compare fork progress."), {
      forkBranch,
      repositoryId: forkRepository.id,
      upstreamBranch,
    });
  }

  const [aheadText, behindText] = text(compareRes.stdout).split(/\s+/);
  return {
    ahead: Number(aheadText) || 0,
    behind: Number(behindText) || 0,
    fork_branch: forkBranch,
    upstream_branch: upstreamBranch,
  };
}

async function ensureUpstreamRemote(repository: GitRepositoryHandle, upstreamPath: string): Promise<void> {
  const listRes = await runGit(["remote"], { cwd: repository.path });
  if (!listRes.ok) {
    throw new GitHostError("git_command_failed", text(listRes.stderr, "Failed to list repository remotes."), {
      repositoryId: repository.id,
    });
  }

  const remotes = new Set(text(listRes.stdout).split(/\r?\n/).map((entry) => text(entry)).filter(Boolean));
  const command = remotes.has("upstream")
    ? ["remote", "set-url", "upstream", upstreamPath]
    : ["remote", "add", "upstream", upstreamPath];
  const remoteRes = await runGit(command, { cwd: repository.path });
  if (!remoteRes.ok) {
    throw new GitHostError("git_command_failed", text(remoteRes.stderr, "Failed to configure the upstream remote."), {
      repositoryId: repository.id,
    });
  }
}

function createGitForge(options: CreateGitForgeOptions): GitForge {
  if (!options || typeof options.gitHost !== "object") {
    throw new TypeError("createGitForge() requires a gitHost instance.");
  }
  if (!options.storage || typeof options.storage !== "object") {
    throw new TypeError("createGitForge() requires a storage adapter.");
  }
  if (typeof options.createForkRepository !== "function") {
    throw new TypeError("createGitForge() requires createForkRepository().");
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const logGroup = "git-host.forge";
  const verbose = options.verbose === true;
  const activityRecorder = createGitForgeActivityRecorder({
    storage: options.storage.activity,
  });
  const actions = options.storage.actions
    ? createGitForgeActionsRuntime({
      actions: options.actions,
      gitHost: options.gitHost,
      releases: options.storage.releases,
      storage: options.storage.actions,
    })
    : null;
  if (actions) {
    actions.bindActivityStorage(options.storage.activity);
  }

  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: logGroup,
    logger: options.logger,
    source: "@trebired/git-host",
  });

  async function recordActivity(
    repositoryId: string,
    actor: GitForgeActor,
    kind: GitForgeActivityKind,
    metadata: Record<string, unknown> = {},
  ): Promise<GitForgeActivityEntry> {
    return await activityRecorder.recordActivity({
      actor_id: actor.id,
      actor_label: text(actor.name, actor.id),
      created_at: nowIso(),
      kind,
      metadata,
      repository_id: repositoryId,
      source: "forge",
    });
  }

  async function readSocialState(repositoryId: string, actorId?: string): Promise<GitForgeSocialState> {
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
  }

  async function readOverview(repositoryId: string, actorId?: string): Promise<GitForgeRepositoryOverview> {
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
  }

  async function readRequiredRelease(repositoryId: string, releaseId: string): Promise<GitForgeRelease> {
    const release = await options.storage.releases.readRelease(repositoryId, releaseId);
    if (!release) {
      throw new GitHostError("forge_resource_not_found", `Release "${releaseId}" was not found.`, {
        releaseId,
        repositoryId,
      });
    }
    return release;
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

  async function resolveReleaseAssetLinkInternal(
    repositoryId: string,
    release: GitForgeRelease,
    asset: GitForgeReleaseAsset,
    repositoryKey?: string,
  ): Promise<GitForgeReleaseAssetLink> {
    const href = text(
      options.releaseAssetStore?.buildAssetDownloadUrl?.({
        asset,
        release,
        repositoryId,
        repositoryKey,
      }),
      text(asset.download_url, `/repositories/${encodeURIComponent(text(repositoryKey, repositoryId))}/releases/${encodeURIComponent(release.id)}/assets/${encodeURIComponent(asset.id)}`),
    );
    return {
      asset_id: asset.id,
      content_type: asset.content_type,
      file_name: text(asset.name, `asset-${asset.id}`),
      href,
      size: asset.size == null ? null : Number(asset.size) || 0,
    };
  }

  async function readRequiredFork(forkRepositoryId: string) {
    const fork = await options.storage.forks.readFork(forkRepositoryId);
    if (!fork) {
      throw new GitHostError("forge_resource_not_found", `Fork "${forkRepositoryId}" was not found.`, {
        forkRepositoryId,
      });
    }
    return fork;
  }

  return {
    async readOverview(repositoryId: string, input = {}) {
      return await readOverview(repositoryId, text(input.actorId));
    },

    async readSocialState(repositoryId: string, input = {}) {
      return await readSocialState(repositoryId, text(input.actorId));
    },

    async listWorkflows(repositoryId: string, filters: GitForgeWorkflowFilters = {}) {
      if (!actions) return [];
      return await actions.listWorkflows(repositoryId, filters);
    },

    async readWorkflow(repositoryId: string, workflowId: string) {
      if (!actions) {
        throw new GitHostError("forge_actions_not_configured", "Actions storage is required to read workflows.");
      }
      return await actions.readWorkflow(repositoryId, workflowId);
    },

    async runWorkflow(repositoryId: string, workflowId: string, input: RunGitForgeWorkflowInput) {
      if (!actions) {
        throw new GitHostError("forge_actions_not_configured", "Actions storage is required to run workflows.");
      }
      return await actions.runWorkflow(repositoryId, workflowId, {
        ...input,
        actor: assertActor(input.actor),
      });
    },

    async cancelWorkflowRun(repositoryId: string, runId: string, input: CancelGitForgeWorkflowRunInput) {
      if (!actions) {
        throw new GitHostError("forge_actions_not_configured", "Actions storage is required to cancel workflow runs.");
      }
      return await actions.cancelWorkflowRun(repositoryId, runId, assertActor(input.actor));
    },

    async listWorkflowRuns(repositoryId: string, filters: GitForgeWorkflowRunFilters = {}) {
      if (!actions) return [];
      return await actions.listWorkflowRuns(repositoryId, filters);
    },

    async readWorkflowRun(repositoryId: string, runId: string) {
      if (!actions) {
        throw new GitHostError("forge_actions_not_configured", "Actions storage is required to read workflow runs.");
      }
      return await actions.readWorkflowRun(repositoryId, runId);
    },

    async listWorkflowRunSteps(repositoryId: string, runId: string) {
      if (!actions) return [];
      return await actions.listWorkflowRunSteps(repositoryId, runId);
    },

    async listWorkflowRunEvents(repositoryId: string, runId: string, filters: GitForgeWorkflowRunEventFilters = {}) {
      if (!actions) return [];
      return await actions.listWorkflowRunEvents(repositoryId, runId, filters);
    },

    subscribeWorkflowRun(repositoryId: string, runId: string, listener) {
      if (!actions) {
        return {
          close() {},
        };
      }
      return actions.subscribeWorkflowRun(repositoryId, runId, listener);
    },

    async starRepository(repositoryId: string, input: { actor: GitForgeActor }) {
      const actor = assertActor(input.actor);
      await options.storage.social.setStar(repositoryId, actor.id, true);
      await recordActivity(repositoryId, actor, "star", {});
      return await readSocialState(repositoryId, actor.id);
    },

    async unstarRepository(repositoryId: string, input: { actor: GitForgeActor }) {
      const actor = assertActor(input.actor);
      await options.storage.social.setStar(repositoryId, actor.id, false);
      await recordActivity(repositoryId, actor, "unstar", {});
      return await readSocialState(repositoryId, actor.id);
    },

    async watchRepository(repositoryId: string, input: { actor: GitForgeActor }) {
      const actor = assertActor(input.actor);
      await options.storage.social.setWatching(repositoryId, actor.id, true);
      await recordActivity(repositoryId, actor, "watch", {});
      return await readSocialState(repositoryId, actor.id);
    },

    async unwatchRepository(repositoryId: string, input: { actor: GitForgeActor }) {
      const actor = assertActor(input.actor);
      await options.storage.social.setWatching(repositoryId, actor.id, false);
      await recordActivity(repositoryId, actor, "unwatch", {});
      return await readSocialState(repositoryId, actor.id);
    },

    async listReleases(repositoryId: string) {
      const releases = await options.storage.releases.listReleases(repositoryId);
      return Array.from(releases).sort((left, right) => text(right.published_at || right.created_at).localeCompare(text(left.published_at || left.created_at)));
    },

    async readRelease(repositoryId: string, releaseId: string) {
      return await readRequiredRelease(repositoryId, releaseId);
    },

    async resolveReleaseAssetLink(repositoryId: string, releaseId: string, assetId: string, input = {}) {
      const release = await readRequiredRelease(repositoryId, releaseId);
      const asset = readRequiredReleaseAsset(release, assetId);
      return await resolveReleaseAssetLinkInternal(repositoryId, release, asset, text(input.repositoryKey));
    },

    async openReleaseAsset(repositoryId: string, releaseId: string, assetId: string, input = {}): Promise<GitForgeReleaseAssetDownload> {
      const release = await readRequiredRelease(repositoryId, releaseId);
      const asset = readRequiredReleaseAsset(release, assetId);
      const repositoryKey = text(input.repositoryKey);
      const download = options.releaseAssetStore?.openAssetDownload
        ? await options.releaseAssetStore.openAssetDownload({
          asset,
          release,
          repositoryId,
          repositoryKey,
        })
        : null;
      if (download) {
        return {
          ...download,
          asset: {
            ...asset,
            download_url: text(download.redirect_url, asset.download_url),
          },
          content_type: text(download.content_type, text(asset.content_type, "application/octet-stream")),
          file_name: text(download.file_name, text(asset.name, `asset-${asset.id}`)),
          size: download.size == null ? (asset.size == null ? null : Number(asset.size) || 0) : download.size,
        };
      }

      const link = await resolveReleaseAssetLinkInternal(repositoryId, release, asset, repositoryKey);
      return {
        asset,
        content_type: text(asset.content_type, "application/octet-stream"),
        file_name: link.file_name,
        redirect_url: link.href,
        size: link.size,
      };
    },

    async createRelease(repositoryId: string, input: CreateGitForgeReleaseInput) {
      const actor = assertActor(input.actor);
      const existingTagName = text(input.existingTagName);
      const createTag = input.createTag;
      if (!existingTagName && !createTag) {
        throw new GitHostError("forge_invalid_input", "A release requires either existingTagName or createTag.", {
          repositoryId,
        });
      }

      let tagName = existingTagName;
      let targetRef = "";
      if (createTag) {
        tagName = text(createTag.name);
        targetRef = text(createTag.targetRef, "HEAD");
        await options.gitHost.createTag(repositoryId, {
          actor: {
            email: actor.email,
            id: actor.id,
            name: actor.name,
          },
          message: text(createTag.annotatedMessage),
          name: tagName,
          ref: targetRef,
        });
      }

      const tagDetail = await options.gitHost.readTag(repositoryId, tagName);
      const createdAt = nowIso();
      const release: GitForgeRelease = {
        assets: options.releaseAssetStore?.normalizeAssets
          ? await options.releaseAssetStore.normalizeAssets(repositoryId, Array.isArray(input.assets) ? input.assets : [])
          : Array.isArray(input.assets) ? input.assets : [],
        author_id: actor.id,
        created_at: createdAt,
        draft: input.draft === true,
        id: randomUUID(),
        notes: text(input.notes),
        prerelease: input.prerelease === true,
        published_at: input.draft === true ? null : (input.publishedAt === null ? null : text(input.publishedAt, createdAt)),
        repository_id: repositoryId,
        tag_name: tagName,
        target_ref: targetRef || text(tagDetail.target_hash),
        title: text(input.title, tagName),
        updated_at: createdAt,
      };

      const created = await options.storage.releases.createRelease(release);
      await recordActivity(repositoryId, actor, "release.create", {
        release_id: created.id,
        tag_name: created.tag_name,
      });
      return created;
    },

    async updateRelease(repositoryId: string, releaseId: string, input: UpdateGitForgeReleaseInput) {
      const actor = assertActor(input.actor);
      await readRequiredRelease(repositoryId, releaseId);
      const assets = options.releaseAssetStore?.normalizeAssets
        ? await options.releaseAssetStore.normalizeAssets(repositoryId, Array.isArray(input.assets) ? input.assets : [])
        : input.assets;
      const updated = await options.storage.releases.updateRelease(repositoryId, releaseId, {
        ...(Array.isArray(assets) ? { assets } : {}),
        ...(input.draft != null ? { draft: input.draft === true } : {}),
        ...(input.notes != null ? { notes: text(input.notes) } : {}),
        ...(input.prerelease != null ? { prerelease: input.prerelease === true } : {}),
        ...(input.publishedAt !== undefined ? { published_at: input.publishedAt === null ? null : text(input.publishedAt) } : {}),
        ...(input.title != null ? { title: text(input.title) } : {}),
        updated_at: nowIso(),
      });
      if (!updated) {
        throw new GitHostError("forge_resource_not_found", `Release "${releaseId}" was not found.`, {
          releaseId,
          repositoryId,
        });
      }
      await recordActivity(repositoryId, actor, "release.update", {
        release_id: releaseId,
      });
      return updated;
    },

    async deleteRelease(repositoryId: string, releaseId: string, input: DeleteGitForgeReleaseInput) {
      const actor = assertActor(input.actor);
      const existing = await readRequiredRelease(repositoryId, releaseId);
      const deleted = await options.storage.releases.deleteRelease(repositoryId, releaseId);
      if (!deleted) {
        throw new GitHostError("forge_resource_not_found", `Release "${releaseId}" was not found.`, {
          releaseId,
          repositoryId,
        });
      }
      if (input.deleteTag === true) {
        await options.gitHost.deleteTag(repositoryId, {
          name: existing.tag_name,
        });
      }
      await recordActivity(repositoryId, actor, "release.delete", {
        release_id: releaseId,
        tag_name: existing.tag_name,
      });
    },

    async listActivity(repositoryId: string, filters = {}) {
      return await activityRecorder.listActivity(repositoryId, filters);
    },

    async listForks(repositoryId: string): Promise<GitForgeFork[]> {
      const upstreamSummary = await readOverview(repositoryId);
      const upstreamRepository = repositoryHandleFromSummary(upstreamSummary.repository);
      const upstreamBranch = text(upstreamSummary.repository.repository.default_branch, "main");
      const forks = await options.storage.forks.listForks(repositoryId);
      return await Promise.all(forks.map(async (fork) => {
        const forkSummary = await readOverview(fork.fork_repository_id);
        const forkRepository = repositoryHandleFromSummary(forkSummary.repository);
        return {
          created_at: fork.created_at,
          created_by: fork.created_by,
          fork_repository_id: fork.fork_repository_id,
          fork_status: await readForkStatus(forkRepository, upstreamRepository, upstreamBranch),
          upstream_repository_id: fork.upstream_repository_id,
        };
      }));
    },

    async createFork(repositoryId: string, input: CreateGitForgeForkInput): Promise<GitForgeFork> {
      const actor = assertActor(input.actor);
      const upstreamSummary = await readOverview(repositoryId);
      const upstreamRepository = repositoryHandleFromSummary(upstreamSummary.repository);
      const upstreamBranch = text(upstreamSummary.repository.repository.default_branch, "main");
      const forkRepository = await options.createForkRepository({
        actor,
        upstreamRepository,
        upstreamRepositoryId: repositoryId,
      });
      if (!forkRepository || !text(forkRepository.id) || !text(forkRepository.path)) {
        throw new GitHostError("forge_invalid_input", "createForkRepository() must return a repository id and absolute path.", {
          repositoryId,
        });
      }

      fs.mkdirSync(path.dirname(forkRepository.path), { recursive: true });
      const cloneRes = await cloneRepository({
        cloneUrl: upstreamRepository.path,
        workspaceRoot: forkRepository.path,
      });
      if (!cloneRes.ok) {
        throw new GitHostError("git_command_failed", text(cloneRes.stderr, "Failed to clone the fork repository."), {
          forkRepositoryId: forkRepository.id,
          repositoryId,
        });
      }
      const hostedRes = await ensureHostedRepositoryConfig(forkRepository.path);
      if (!hostedRes.ok) {
        throw new GitHostError("git_command_failed", text(hostedRes.stderr, "Failed to configure the fork repository."), {
          forkRepositoryId: forkRepository.id,
          repositoryId,
        });
      }
      await ensureUpstreamRemote(forkRepository, upstreamRepository.path);
      await fetchRepository(forkRepository, { remote: "upstream" });

      const createdAt = nowIso();
      await options.storage.forks.createFork({
        created_at: createdAt,
        created_by: actor.id,
        fork_repository_id: forkRepository.id,
        upstream_repository_id: repositoryId,
      });

      await recordActivity(repositoryId, actor, "fork.create", {
        fork_repository_id: forkRepository.id,
      });

      if (verbose) {
        logger.info(logGroup, "created forge fork", {
          forkRepositoryId: forkRepository.id,
          repositoryId,
        });
      }

      return {
        created_at: createdAt,
        created_by: actor.id,
        fork_repository_id: forkRepository.id,
        fork_status: await readForkStatus(forkRepository, upstreamRepository, upstreamBranch),
        upstream_repository_id: repositoryId,
      };
    },

    async syncFork(forkRepositoryId: string, input: SyncGitForgeForkInput): Promise<GitForgeFork> {
      const actor = assertActor(input.actor);
      const fork = await readRequiredFork(forkRepositoryId);
      const upstreamSummary = await readOverview(fork.upstream_repository_id);
      const forkSummary = await readOverview(fork.fork_repository_id);
      const upstreamRepository = repositoryHandleFromSummary(upstreamSummary.repository);
      const forkRepository = repositoryHandleFromSummary(forkSummary.repository);
      const upstreamBranch = text(upstreamSummary.repository.repository.default_branch, "main");
      const forkBranch = text(forkSummary.repository.repository.current_branch || forkSummary.repository.repository.default_branch, "main");
      const strategy = input.strategy || "ff-only";

      await ensureUpstreamRemote(forkRepository, upstreamRepository.path);
      await fetchRepository(forkRepository, { remote: "upstream" });

      if (forkBranch !== forkSummary.repository.repository.current_branch) {
        await options.gitHost.checkoutBranch(forkRepository.id, { name: forkBranch });
      }

      const upstreamRef = `upstream/${upstreamBranch}`;
      if (strategy === "ff-only") {
        const ffCheck = await runGit(["merge-base", "--is-ancestor", forkBranch, upstreamRef], { cwd: forkRepository.path });
        if (!ffCheck.ok) {
          throw new GitHostError("forge_sync_conflict", "The fork cannot be fast-forwarded from upstream.", {
            forkRepositoryId,
            upstreamBranch,
          });
        }
        const mergeRes = await runGit(["merge", "--ff-only", upstreamRef], {
          cwd: forkRepository.path,
          env: buildGitEnv({
            actor: {
              email: actor.email,
              id: actor.id,
              name: actor.name,
            },
          }),
        });
        if (!mergeRes.ok) {
          throw new GitHostError("forge_sync_conflict", text(mergeRes.stderr, "The fork cannot be fast-forwarded from upstream."), {
            forkRepositoryId,
            upstreamBranch,
          });
        }
      } else {
        const mergeRes = await runGit(["merge", "--no-edit", upstreamRef], {
          cwd: forkRepository.path,
          env: buildGitEnv({
            actor: {
              email: actor.email,
              id: actor.id,
              name: actor.name,
            },
          }),
        });
        if (!mergeRes.ok) {
          throw new GitHostError("forge_sync_conflict", text(mergeRes.stderr, "Failed to merge upstream changes into the fork."), {
            forkRepositoryId,
            upstreamBranch,
          });
        }
      }

      await recordActivity(fork.upstream_repository_id, actor, "fork.sync", {
        fork_repository_id: forkRepositoryId,
        strategy,
      });

      return {
        created_at: fork.created_at,
        created_by: fork.created_by,
        fork_repository_id: fork.fork_repository_id,
        fork_status: await readForkStatus(forkRepository, upstreamRepository, upstreamBranch),
        upstream_repository_id: fork.upstream_repository_id,
      };
    },
  };
}

export { createGitForge };
