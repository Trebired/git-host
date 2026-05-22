import type { ReactNode } from "react";

import type {
  GitBlob,
  GitBranchSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitRepositorySummary,
  GitTreeEntry,
} from "../../types.js";
import type { GitApiClient, GitApiClientHeaders } from "../client.js";

type GitApiClientProviderProps = {
  children?: ReactNode;
  client: GitApiClient;
};

type GitApiQueryOptions<TData> = {
  client?: GitApiClient;
  enabled?: boolean;
  headers?: GitApiClientHeaders;
  initialData?: TData | null;
};

type GitApiQueryResult<TData> = {
  data: TData | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
};

type UseGitRepositorySummaryOptions = GitApiQueryOptions<GitRepositorySummary> & {
  commitLimit?: number;
};

type UseGitCommitsOptions = GitApiQueryOptions<GitCommitSummary[]> & {
  limit?: number;
};

type UseGitTreeOptions = GitApiQueryOptions<GitTreeEntry[]> & {
  path?: string;
  recursive?: boolean;
  ref?: string;
};

type UseGitBlobOptions = GitApiQueryOptions<GitBlob> & {
  path: string;
  ref?: string;
};

type UseGitDiffOptions = GitApiQueryOptions<GitCompareSummary> & {
  baseRef: string;
  headRef: string;
};

export type {
  GitApiClientProviderProps,
  GitApiQueryOptions,
  GitApiQueryResult,
  UseGitBlobOptions,
  UseGitCommitsOptions,
  UseGitDiffOptions,
  UseGitRepositorySummaryOptions,
  UseGitTreeOptions,
  GitBranchSummary,
  GitCommitDetail,
  GitRepositorySummary,
  GitCommitSummary,
  GitTreeEntry,
  GitBlob,
  GitCompareSummary,
};
