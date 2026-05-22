import type { GitBlob, GitBranchSummary, GitCommitDetail, GitCommitSummary, GitCompareSummary, GitRepositorySummary, GitTreeEntry } from "../../types.js";
import { useGitApiQuery } from "./query.js";
import type {
  GitApiQueryOptions,
  GitApiQueryResult,
  UseGitBlobOptions,
  UseGitCommitsOptions,
  UseGitDiffOptions,
  UseGitRepositorySummaryOptions,
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
    key: ["commits", repositoryKey, options?.limit ?? null],
    load(client, signal) {
      return client.listCommits(repositoryKey, {
        headers: options?.headers,
        limit: options?.limit,
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

function useGitTree(
  repositoryKey: string,
  options?: UseGitTreeOptions,
): GitApiQueryResult<GitTreeEntry[]> {
  const enabled = (options?.enabled !== false) && Boolean(repositoryKey);
  return useGitApiQuery({
    ...options,
    enabled,
    key: ["tree", repositoryKey, options?.path ?? "", options?.ref ?? "", options?.recursive === true],
    load(client, signal) {
      return client.listTree(repositoryKey, {
        headers: options?.headers,
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
    key: ["diff", repositoryKey, options.baseRef, options.headRef],
    load(client, signal) {
      return client.diff(repositoryKey, {
        baseRef: options.baseRef,
        headRef: options.headRef,
        headers: options.headers,
        signal,
      });
    },
  });
}

export {
  useGitBlob,
  useGitBranches,
  useGitCommit,
  useGitCommits,
  useGitDiff,
  useGitRepositorySummary,
  useGitTree,
};
