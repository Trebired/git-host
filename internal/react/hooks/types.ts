import type { ReactNode } from "react";

import type {
  GitArchive,
  GitBlame,
  GitBlob,
  GitBranchSummary,
  GitForgeActivityEntry,
  GitForgeFork,
  GitForgeRelease,
  GitForgeReleaseAsset,
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
} from "#1mbdfxwwqqpa";
import type { GitApiClient, GitApiClientHeaders } from "#402c2u4czl3p";

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

type GitApiMutationResult<TInput, TData> = {
  data: TData | null;
  error: Error | null;
  loading: boolean;
  mutate: (input: TInput) => Promise<TData>;
  reset: () => void;
};

type UseGitRepositorySummaryOptions = GitApiQueryOptions<GitRepositorySummary> & {
  commitLimit?: number;
};

type UseGitCommitsOptions = GitApiQueryOptions<GitCommitSummary[]> & {
  limit?: number;
  path?: string;
  ref?: string;
};

type UseGitLinguistOptions = GitApiQueryOptions<GitRepositoryLinguist> & {
  ref?: string;
};

type UseGitTagsOptions = GitApiQueryOptions<GitTagSummary[]>;

type UseGitTagOptions = GitApiQueryOptions<GitTagDetail>;

type UseGitTreeOptions = GitApiQueryOptions<GitTreeEntry[]> & {
  icons?: boolean;
  linguist?: boolean;
  path?: string;
  recursive?: boolean;
  ref?: string;
};

type UseGitBlameOptions = GitApiQueryOptions<GitBlame> & {
  path: string;
  ref?: string;
};

type UseGitBlobOptions = GitApiQueryOptions<GitBlob> & {
  path: string;
  ref?: string;
};

type UseGitDiffOptions = GitApiQueryOptions<GitCompareSummary> & {
  baseRef: string;
  headRef: string;
  path?: string;
};

type UseGitSearchOptions = GitApiQueryOptions<GitSearchResult> & {
  caseSensitive?: boolean;
  limit?: number;
  path?: string;
  query: string;
  ref?: string;
  regexp?: boolean;
};

type UseGitArchiveOptions = GitApiQueryOptions<GitArchive> & {
  format?: "tar" | "tar.gz" | "zip";
  prefix?: string;
  ref?: string;
};

type UseGitOverviewOptions = GitApiQueryOptions<GitForgeRepositoryOverview>;

type UseGitSocialStateOptions = GitApiQueryOptions<GitForgeSocialState>;

type UseGitReleasesOptions = GitApiQueryOptions<GitForgeRelease[]>;

type UseGitReleaseOptions = GitApiQueryOptions<GitForgeRelease>;

type UseGitForksOptions = GitApiQueryOptions<GitForgeFork[]>;

type UseGitActivityOptions = GitApiQueryOptions<GitForgeActivityEntry[]>;

export type {
  GitApiClientProviderProps,
  GitApiMutationResult,
  GitArchive,
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
  GitBlame,
  GitBranchSummary,
  GitCommitDetail,
  GitRepositoryLinguist,
  GitRepositorySummary,
  GitCommitSummary,
  GitTagDetail,
  GitTagSummary,
  GitTreeEntry,
  GitBlob,
  GitCompareSummary,
  GitForgeActivityEntry,
  GitForgeFork,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitSearchResult,
};
