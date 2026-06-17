import type {
  GitArchive,
  GitBlame,
  GitBlob,
  GitBranchSummary,
  GitForgeActivityEntry,
  GitForgeFork,
  GitForgeRelease,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitTagDetail,
  GitTagSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitRepositoryLinguist,
  GitRepositorySummary,
  GitSearchResult,
  GitTreeEntry,
} from "../../types.js";
import type { GitApiClient } from "../client.js";
import { useGitApiMutation, useGitApiQuery } from "./query.js";
import type {
  GitApiQueryOptions,
  GitApiQueryResult,
  UseGitArchiveOptions,
  UseGitActivityOptions,
  UseGitBlameOptions,
  UseGitBlobOptions,
  UseGitCommitsOptions,
  UseGitDiffOptions,
  UseGitForksOptions,
  UseGitLinguistOptions,
  UseGitOverviewOptions,
  UseGitReleaseOptions,
  UseGitReleasesOptions,
  UseGitRepositorySummaryOptions,
  UseGitSearchOptions,
  UseGitSocialStateOptions,
  UseGitTagOptions,
  UseGitTagsOptions,
  UseGitTreeOptions,
} from "./types.js";

function useGitRepositorySummary(
  repositoryKey: string,
  options?: UseGitRepositorySummaryOptions,
): GitApiQueryResult<GitRepositorySummary> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["summary", repositoryKey, options?.commitLimit ?? null],
    load(client, signal) {
      return client.readSummary(repositoryKey, {
        commitLimit: options?.commitLimit,
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitBranches(
  repositoryKey: string,
  options?: GitApiQueryOptions<GitBranchSummary[]>,
): GitApiQueryResult<GitBranchSummary[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["branches", repositoryKey],
    load(client, signal) {
      return client.listBranches(repositoryKey, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitCommits(
  repositoryKey: string,
  options?: UseGitCommitsOptions,
): GitApiQueryResult<GitCommitSummary[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["commits", repositoryKey, options?.limit ?? null, options?.ref ?? "", options?.path ?? ""],
    load(client, signal) {
      return client.listCommits(repositoryKey, {
        headers: options?.headers,
        limit: options?.limit,
        path: options?.path,
        ref: options?.ref,
        signal,
      });
    },
  });
}

function useGitCommit(
  repositoryKey: string,
  commitRef: string,
  options?: GitApiQueryOptions<GitCommitDetail>,
): GitApiQueryResult<GitCommitDetail> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey) && Boolean(commitRef);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["commit", repositoryKey, commitRef],
    load(client, signal) {
      return client.readCommit(repositoryKey, commitRef, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitLinguist(
  repositoryKey: string,
  options?: UseGitLinguistOptions,
): GitApiQueryResult<GitRepositoryLinguist> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["linguist", repositoryKey, options?.ref ?? ""],
    load(client, signal) {
      return client.readLinguist(repositoryKey, {
        headers: options?.headers,
        ref: options?.ref,
        signal,
      });
    },
  });
}

function useGitTags(
  repositoryKey: string,
  options?: UseGitTagsOptions,
): GitApiQueryResult<GitTagSummary[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["tags", repositoryKey],
    load(client, signal) {
      return client.listTags(repositoryKey, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitTag(
  repositoryKey: string,
  tagName: string,
  options?: UseGitTagOptions,
): GitApiQueryResult<GitTagDetail> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey) && Boolean(tagName);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["tag", repositoryKey, tagName],
    load(client, signal) {
      return client.readTag(repositoryKey, tagName, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitTree(
  repositoryKey: string,
  options?: UseGitTreeOptions,
): GitApiQueryResult<GitTreeEntry[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: [
      "tree",
      repositoryKey,
      options?.path ?? "",
      options?.ref ?? "",
      options?.recursive === true,
      options?.linguist === true,
      options?.icons === true,
    ],
    load(client, signal) {
      return client.listTree(repositoryKey, {
        headers: options?.headers,
        icons: options?.icons,
        linguist: options?.linguist,
        path: options?.path,
        recursive: options?.recursive,
        ref: options?.ref,
        signal,
      });
    },
  });
}

function useGitBlob(
  repositoryKey: string,
  options: UseGitBlobOptions,
): GitApiQueryResult<GitBlob> {
  const enabled = (options.enabled !== false) && Boolean(repositoryKey) && Boolean(options.path);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["blob", repositoryKey, options.path, options.ref ?? ""],
    load(client, signal) {
      return client.readBlob(repositoryKey, {
        headers: options.headers,
        path: options.path,
        ref: options.ref,
        signal,
      });
    },
  });
}

function useGitBlame(
  repositoryKey: string,
  options: UseGitBlameOptions,
): GitApiQueryResult<GitBlame> {
  const enabled = (options.enabled !== false) && Boolean(repositoryKey) && Boolean(options.path);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["blame", repositoryKey, options.path, options.ref ?? ""],
    load(client, signal) {
      return client.readBlame(repositoryKey, {
        headers: options.headers,
        path: options.path,
        ref: options.ref,
        signal,
      });
    },
  });
}

function useGitDiff(
  repositoryKey: string,
  options: UseGitDiffOptions,
): GitApiQueryResult<GitCompareSummary> {
  const enabled = (options.enabled !== false)
    && Boolean(repositoryKey)
    && Boolean(options.baseRef)
    && Boolean(options.headRef);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["diff", repositoryKey, options.baseRef, options.headRef, options.path ?? ""],
    load(client, signal) {
      return client.diff(repositoryKey, {
        baseRef: options.baseRef,
        headRef: options.headRef,
        headers: options.headers,
        path: options.path,
        signal,
      });
    },
  });
}

function useGitSearch(
  repositoryKey: string,
  options: UseGitSearchOptions,
): GitApiQueryResult<GitSearchResult> {
  const enabled = (options.enabled !== false) && Boolean(repositoryKey) && Boolean(options.query);
  return useGitApiQuery({
    ...options,
    enabled,
    key: [
      "search",
      repositoryKey,
      options.query,
      options.ref ?? "",
      options.path ?? "",
      options.caseSensitive === true,
      options.regexp === true,
      options.limit ?? null,
    ],
    load(client, signal) {
      return client.search(repositoryKey, {
        caseSensitive: options.caseSensitive,
        headers: options.headers,
        limit: options.limit,
        path: options.path,
        query: options.query,
        ref: options.ref,
        regexp: options.regexp,
        signal,
      });
    },
  });
}

function useGitArchive(
  repositoryKey: string,
  options?: UseGitArchiveOptions,
): GitApiQueryResult<GitArchive> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["archive", repositoryKey, options?.ref ?? "", options?.format ?? "tar.gz", options?.prefix ?? ""],
    load(client, signal) {
      return client.readArchive(repositoryKey, {
        format: options?.format,
        headers: options?.headers,
        prefix: options?.prefix,
        ref: options?.ref,
        signal,
      });
    },
  });
}

function useGitOverview(
  repositoryKey: string,
  options?: UseGitOverviewOptions,
): GitApiQueryResult<GitForgeRepositoryOverview> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["overview", repositoryKey],
    load(client, signal) {
      return client.readOverview(repositoryKey, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitSocialState(
  repositoryKey: string,
  options?: UseGitSocialStateOptions,
): GitApiQueryResult<GitForgeSocialState> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["social", repositoryKey],
    load(client, signal) {
      return client.readSocialState(repositoryKey, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitReleases(
  repositoryKey: string,
  options?: UseGitReleasesOptions,
): GitApiQueryResult<GitForgeRelease[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["releases", repositoryKey],
    load(client, signal) {
      return client.listReleases(repositoryKey, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitRelease(
  repositoryKey: string,
  releaseId: string,
  options?: UseGitReleaseOptions,
): GitApiQueryResult<GitForgeRelease> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey) && Boolean(releaseId);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["release", repositoryKey, releaseId],
    load(client, signal) {
      return client.readRelease(repositoryKey, releaseId, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitForks(
  repositoryKey: string,
  options?: UseGitForksOptions,
): GitApiQueryResult<GitForgeFork[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["forks", repositoryKey],
    load(client, signal) {
      return client.listForks(repositoryKey, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function useGitActivity(
  repositoryKey: string,
  options?: UseGitActivityOptions,
): GitApiQueryResult<GitForgeActivityEntry[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["activity", repositoryKey],
    load(client, signal) {
      return client.listActivity(repositoryKey, {
        headers: options?.headers,
        signal,
      });
    },
  });
}

function applyGitStarOptimisticState(
  current: GitForgeSocialState | null,
  starred: boolean,
): GitForgeSocialState | null {
  if (!current) return current;
  const nextCount = current.star_count + (starred ? (current.viewer_has_starred ? 0 : 1) : (current.viewer_has_starred ? -1 : 0));
  return {
    ...current,
    star_count: Math.max(0, nextCount),
    viewer_has_starred: starred,
  };
}

function applyGitWatchOptimisticState(
  current: GitForgeSocialState | null,
  watching: boolean,
): GitForgeSocialState | null {
  if (!current) return current;
  const nextCount = current.watcher_count + (watching ? (current.viewer_is_watching ? 0 : 1) : (current.viewer_is_watching ? -1 : 0));
  return {
    ...current,
    viewer_is_watching: watching,
    watcher_count: Math.max(0, nextCount),
  };
}

function useGitStarRepository(repositoryKey: string, options?: GitApiQueryOptions<GitForgeSocialState>) {
  return useGitApiMutation<void, GitForgeSocialState>({
    client: options?.client,
    mutate(client) {
      return client.starRepository(repositoryKey, {
        headers: options?.headers,
      });
    },
  });
}

function useGitUnstarRepository(repositoryKey: string, options?: GitApiQueryOptions<GitForgeSocialState>) {
  return useGitApiMutation<void, GitForgeSocialState>({
    client: options?.client,
    mutate(client) {
      return client.unstarRepository(repositoryKey, {
        headers: options?.headers,
      });
    },
  });
}

function useGitWatchRepository(repositoryKey: string, options?: GitApiQueryOptions<GitForgeSocialState>) {
  return useGitApiMutation<void, GitForgeSocialState>({
    client: options?.client,
    mutate(client) {
      return client.watchRepository(repositoryKey, {
        headers: options?.headers,
      });
    },
  });
}

function useGitUnwatchRepository(repositoryKey: string, options?: GitApiQueryOptions<GitForgeSocialState>) {
  return useGitApiMutation<void, GitForgeSocialState>({
    client: options?.client,
    mutate(client) {
      return client.unwatchRepository(repositoryKey, {
        headers: options?.headers,
      });
    },
  });
}

function useGitCreateRelease(repositoryKey: string, options?: GitApiQueryOptions<GitForgeRelease>) {
  return useGitApiMutation<Parameters<GitApiClient["createRelease"]>[1], GitForgeRelease>({
    client: options?.client,
    mutate(client, input) {
      return client.createRelease(repositoryKey, {
        ...input,
        headers: {
          ...(options?.headers || {}),
          ...(input.headers || {}),
        },
      });
    },
  });
}

function useGitUpdateRelease(repositoryKey: string, releaseId: string, options?: GitApiQueryOptions<GitForgeRelease>) {
  return useGitApiMutation<Parameters<GitApiClient["updateRelease"]>[2], GitForgeRelease>({
    client: options?.client,
    mutate(client, input) {
      return client.updateRelease(repositoryKey, releaseId, {
        ...input,
        headers: {
          ...(options?.headers || {}),
          ...(input.headers || {}),
        },
      });
    },
  });
}

function useGitDeleteRelease(repositoryKey: string, releaseId: string, options?: GitApiQueryOptions<{ deleted: boolean; release_id: string }>) {
  return useGitApiMutation<Parameters<GitApiClient["deleteRelease"]>[2], { deleted: boolean; release_id: string }>({
    client: options?.client,
    mutate(client, input) {
      return client.deleteRelease(repositoryKey, releaseId, {
        ...input,
        headers: {
          ...(options?.headers || {}),
          ...((input && input.headers) || {}),
        },
      });
    },
  });
}

function useGitCreateFork(repositoryKey: string, options?: GitApiQueryOptions<GitForgeFork>) {
  return useGitApiMutation<void, GitForgeFork>({
    client: options?.client,
    mutate(client) {
      return client.createFork(repositoryKey, {
        headers: options?.headers,
      });
    },
  });
}

function useGitSyncFork(repositoryKey: string, forkId: string, options?: GitApiQueryOptions<GitForgeFork>) {
  return useGitApiMutation<{ strategy?: "ff-only" | "merge" } | void, GitForgeFork>({
    client: options?.client,
    mutate(client, input) {
      return client.syncFork(repositoryKey, forkId, {
        headers: options?.headers,
        strategy: input && typeof input === "object" ? input.strategy : undefined,
      });
    },
  });
}

export {
  applyGitStarOptimisticState,
  applyGitWatchOptimisticState,
  useGitArchive,
  useGitActivity,
  useGitBlame,
  useGitBlob,
  useGitBranches,
  useGitCommit,
  useGitCommits,
  useGitCreateFork,
  useGitCreateRelease,
  useGitDeleteRelease,
  useGitDiff,
  useGitForks,
  useGitLinguist,
  useGitOverview,
  useGitRelease,
  useGitReleases,
  useGitRepositorySummary,
  useGitSearch,
  useGitSocialState,
  useGitStarRepository,
  useGitSyncFork,
  useGitTag,
  useGitTags,
  useGitTree,
  useGitUnstarRepository,
  useGitUnwatchRepository,
  useGitUpdateRelease,
  useGitWatchRepository,
};
