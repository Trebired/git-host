export { GitApiClientProvider, useGitApiClient, useGitApiQuery } from "./hooks/query.js";
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
} from "./hooks/resources.js";

export type {
  GitApiClientProviderProps,
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
} from "./hooks/types.js";
