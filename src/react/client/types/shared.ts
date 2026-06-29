import type { ManagerOptions, SocketOptions } from "socket.io-client";

import type {
  GitApiResource,
  GitForgeActivityEntry,
  GitForgeActivityFilters,
  GitForgeFork,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetLink,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunStep,
  GitLinguistProgressEvent,
  MaybePromise,
} from "#1mbdfxwwqqpa";

type GitApiClientHeaders = Record<string, string>;

type GitApiClientFetch = (input: string, init?: RequestInit) => Promise<Response>;

type GitApiHeaderResolver = GitApiClientHeaders | ((
  input: {
    path: string;
    repositoryKey?: string;
  },
) => MaybePromise<GitApiClientHeaders | undefined>);

type CreateGitApiClientOptions = {
  buildArchiveUrl?: (input: {
    baseUrl: string;
    defaultHref: string;
    format: "tar.gz" | "zip";
    ref: string;
    repositoryKey: string;
  }) => string | null | undefined;
  buildReleaseAssetUrl?: (input: {
    assetId: string;
    baseUrl: string;
    defaultHref: string;
    releaseId: string;
    repositoryKey: string;
  }) => string | null | undefined;
  baseUrl: string;
  fetch?: GitApiClientFetch;
  headers?: GitApiHeaderResolver;
  socketOptions?: Partial<ManagerOptions & SocketOptions> & {
    path?: string;
  };
};

type GitApiClientRequestOptions = {
  body?: unknown;
  headers?: GitApiClientHeaders;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
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

type GitApiEventStream = {
  close: () => void;
  completed: Promise<void>;
};

export type {
  CreateGitApiClientOptions,
  GitApiClientFetch,
  GitApiClientHeaders,
  GitApiClientRequestOptions,
  GitApiEventStream,
  GitApiFailureResponse,
  GitApiHeaderResolver,
  GitApiResource,
  GitApiResponse,
  GitApiSuccessResponse,
  GitForgeActivityEntry,
  GitForgeActivityFilters,
  GitForgeFork,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetLink,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunStep,
  GitLinguistProgressEvent,
  MaybePromise,
};
