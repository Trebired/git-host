export { GitApiClientError, createGitApiClient } from "./client.js";
export {
  GitApiClientProvider,
  useGitApiClient,
  useGitApiQuery,
  useGitBlob,
  useGitBranches,
  useGitCommit,
  useGitCommits,
  useGitDiff,
  useGitRepositorySummary,
  useGitTree,
} from "./hooks.js";

export type {
  CreateGitApiClientOptions,
  GitApiClient,
  GitApiClientFetch,
  GitApiClientHeaders,
  GitApiClientRequestOptions,
  GitApiFailureResponse,
  GitApiHeaderResolver,
  GitApiResponse,
  GitApiSuccessResponse,
} from "./client.js";
export type {
  GitApiClientProviderProps,
  GitApiQueryOptions,
  GitApiQueryResult,
  UseGitBlobOptions,
  UseGitCommitsOptions,
  UseGitDiffOptions,
  UseGitRepositorySummaryOptions,
  UseGitTreeOptions,
} from "./hooks.js";
