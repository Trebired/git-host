export { GitApiClientProvider, useGitApiClient, useGitApiQuery } from "./hooks/query.js";
export {
  useGitBlob,
  useGitBranches,
  useGitCommit,
  useGitCommits,
  useGitDiff,
  useGitRepositorySummary,
  useGitTree,
} from "./hooks/resources.js";

export type {
  GitApiClientProviderProps,
  GitApiQueryOptions,
  GitApiQueryResult,
  UseGitBlobOptions,
  UseGitCommitsOptions,
  UseGitDiffOptions,
  UseGitRepositorySummaryOptions,
  UseGitTreeOptions,
} from "./hooks/types.js";
