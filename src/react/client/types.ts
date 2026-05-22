import type {
  GitApiResource,
  GitBlob,
  GitBranchSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitRepositorySummary,
  GitTreeEntry,
  MaybePromise,
} from "../../types.js";

type GitApiClientHeaders = Record<string, string>;

type GitApiClientFetch = (input: string, init?: RequestInit) => Promise<Response>;

type GitApiHeaderResolver = GitApiClientHeaders | ((
  input: {
    path: string;
    repositoryKey?: string;
  },
) => MaybePromise<GitApiClientHeaders | undefined>);

type CreateGitApiClientOptions = {
  baseUrl: string;
  fetch?: GitApiClientFetch;
  headers?: GitApiHeaderResolver;
};

type GitApiClientRequestOptions = {
  headers?: GitApiClientHeaders;
  signal?: AbortSignal;
};

type GitApiSuccessResponse<TAction extends GitApiResource, TData> = {
  action: TAction;
  data: TData;
  ok: true;
  repository_id: string;
  repository_key: string;
};

type GitApiFailureResponse = {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  ok: false;
};

type GitApiResponse<TAction extends GitApiResource, TData> =
  | GitApiFailureResponse
  | GitApiSuccessResponse<TAction, TData>;

type GitApiClient = {
  baseUrl: string;
  diff(
    repositoryKey: string,
    options: GitApiClientRequestOptions & {
      baseRef: string;
      headRef: string;
    },
  ): Promise<GitCompareSummary>;
  listBranches(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitBranchSummary[]>;
  listCommits(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      limit?: number;
    },
  ): Promise<GitCommitSummary[]>;
  listTree(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      path?: string;
      recursive?: boolean;
      ref?: string;
    },
  ): Promise<GitTreeEntry[]>;
  readBlob(
    repositoryKey: string,
    options: GitApiClientRequestOptions & {
      path: string;
      ref?: string;
    },
  ): Promise<GitBlob>;
  readCommit(
    repositoryKey: string,
    commitRef: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitCommitDetail>;
  readSummary(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      commitLimit?: number;
    },
  ): Promise<GitRepositorySummary>;
  request<TAction extends GitApiResource, TData>(
    repositoryKey: string,
    actionPath: string,
    options?: GitApiClientRequestOptions & {
      query?: URLSearchParams;
    },
  ): Promise<GitApiSuccessResponse<TAction, TData>>;
};

export type {
  CreateGitApiClientOptions,
  GitApiClient,
  GitApiClientFetch,
  GitApiClientHeaders,
  GitApiClientRequestOptions,
  GitApiFailureResponse,
  GitApiHeaderResolver,
  GitApiResponse,
  GitApiResource,
  GitApiSuccessResponse,
};
