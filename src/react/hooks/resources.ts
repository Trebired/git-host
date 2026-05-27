import type {
  GitArchive,
  GitBlame,
  GitBlob,
  GitBranchSummary,
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
import { useGitApiQuery } from "./query.js";
import type {
  GitApiQueryOptions,
  GitApiQueryResult,
  UseGitArchiveOptions,
  UseGitBlameOptions,
  UseGitBlobOptions,
  UseGitCommitsOptions,
  UseGitDiffOptions,
  UseGitLinguistOptions,
  UseGitRepositorySummaryOptions,
  UseGitSearchOptions,
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
    key: ["archive", repositoryKey, options?.ref ?? "", options?.format ?? "tar", options?.prefix ?? ""],
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

export {
  useGitArchive,
  useGitBlame,
  useGitBlob,
  useGitBranches,
  useGitCommit,
  useGitCommits,
  useGitDiff,
  useGitLinguist,
  useGitRepositorySummary,
  useGitSearch,
  useGitTag,
  useGitTags,
  useGitTree,
};
