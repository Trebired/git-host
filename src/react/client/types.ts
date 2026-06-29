import type {
  GitArchive,
  GitBlame,
  GitApiResource,
  GitSourceArchiveLinks,
  GitBlob,
  GitBranchSummary,
  GitForgeActivityFilters,
  GitForgeActivityEntry,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunStep,
  GitForgeFork,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetLink,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitLinguistProgressEvent,
  GitTagDetail,
  GitTagSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitRepositoryLinguist,
  GitRepositorySummary,
  GitSearchResult,
  GitTreeEntry,
  MaybePromise,
} from "#1mbdfxwwqqpa";
import type { ManagerOptions, SocketOptions } from "socket.io-client";

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

type GitLinguistSocketProgressEvent = {
  progress: GitLinguistProgressEvent;
  type: "progress";
};

type GitLinguistSocketResultEvent = {
  action: "linguist";
  data: GitRepositoryLinguist;
  repository_id: string;
  repository_key: string;
  type: "result";
};

type GitLinguistSocketErrorEvent = {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  status?: number;
  type: "error";
};

type GitLinguistSocketDoneEvent = {
  ok: boolean;
  repository_id?: string;
  repository_key?: string;
  type: "done";
};

type GitLinguistSocketEvent =
  | GitLinguistSocketDoneEvent
  | GitLinguistSocketErrorEvent
  | GitLinguistSocketProgressEvent
  | GitLinguistSocketResultEvent;

type GitWorkflowRunSocketDoneEvent = {
  ok: boolean;
  repository_id?: string;
  repository_key?: string;
  run_id?: string;
  type: "done";
};

type GitWorkflowRunSocketErrorEvent = {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  repository_id?: string;
  repository_key?: string;
  run_id?: string;
  status?: number;
  type: "error";
};

type GitWorkflowRunSocketEvent =
  | GitWorkflowRunSocketDoneEvent
  | GitWorkflowRunSocketErrorEvent
  | (GitForgeWorkflowRunEvent & { type: GitForgeWorkflowRunEvent["type"] });

type GitApiClient = {
  baseUrl: string;
  diff(
    repositoryKey: string,
    options: GitApiClientRequestOptions & {
      baseRef: string;
      headRef: string;
      path?: string;
    },
  ): Promise<GitCompareSummary>;
  listBranches(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitBranchSummary[]>;
  listCommits(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      limit?: number;
      path?: string;
      ref?: string;
    },
  ): Promise<GitCommitSummary[]>;
  listTags(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitTagSummary[]>;
  listActivity(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & GitForgeActivityFilters,
  ): Promise<GitForgeActivityEntry[]>;
  listWorkflowRuns(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & GitForgeWorkflowRunFilters,
  ): Promise<GitForgeWorkflowRun[]>;
  listWorkflowRunSteps(
    repositoryKey: string,
    runId: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitForgeWorkflowRunStep[]>;
  listWorkflowRunEvents(
    repositoryKey: string,
    runId: string,
    options?: GitApiClientRequestOptions & GitForgeWorkflowRunEventFilters,
  ): Promise<GitForgeWorkflowRunEvent[]>;
  listWorkflows(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & GitForgeWorkflowFilters,
  ): Promise<GitForgeWorkflow[]>;
  listForks(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeFork[]>;
  listReleases(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeRelease[]>;
  listTree(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      icons?: boolean;
      linguist?: boolean;
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
  readArchive(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      format?: "tar" | "tar.gz" | "zip";
      prefix?: string;
      ref?: string;
    },
  ): Promise<GitArchive>;
  getArchiveLinks(
    repositoryKey: string,
    input?: {
      fileName?: string;
      ref?: string;
      rootDirectory?: string;
    },
  ): GitSourceArchiveLinks;
  getReleaseAssetLink(
    repositoryKey: string,
    releaseId: string,
    asset: GitForgeReleaseAsset,
  ): GitForgeReleaseAssetLink;
  readBlame(
    repositoryKey: string,
    options: GitApiClientRequestOptions & {
      path: string;
      ref?: string;
    },
  ): Promise<GitBlame>;
  readCommit(
    repositoryKey: string,
    commitRef: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitCommitDetail>;
  readLinguist(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      ref?: string;
    },
  ): Promise<GitRepositoryLinguist>;
  openLinguistSocket(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      onDone?: (event: GitLinguistSocketDoneEvent) => MaybePromise<void>;
      onError?: (event: GitLinguistSocketErrorEvent) => MaybePromise<void>;
      onEvent?: (event: GitLinguistSocketEvent) => MaybePromise<void>;
      onProgress?: (event: GitLinguistProgressEvent) => MaybePromise<void>;
      onResult?: (event: GitLinguistSocketResultEvent) => MaybePromise<void>;
      ref?: string;
    },
  ): GitApiEventStream;
  openWorkflowRunSocket(
    repositoryKey: string,
    runId: string,
    options?: GitApiClientRequestOptions & {
      afterSequence?: number;
      onDone?: (event: GitWorkflowRunSocketDoneEvent) => MaybePromise<void>;
      onError?: (event: GitWorkflowRunSocketErrorEvent) => MaybePromise<void>;
      onEvent?: (event: GitWorkflowRunSocketEvent) => MaybePromise<void>;
    },
  ): GitApiEventStream;
  readTag(
    repositoryKey: string,
    tagName: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitTagDetail>;
  readOverview(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeRepositoryOverview>;
  readRelease(
    repositoryKey: string,
    releaseId: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitForgeRelease>;
  readWorkflow(
    repositoryKey: string,
    workflowId: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitForgeWorkflow>;
  readWorkflowRun(
    repositoryKey: string,
    runId: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitForgeWorkflowRun>;
  readSocialState(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeSocialState>;
  readSummary(
    repositoryKey: string,
    options?: GitApiClientRequestOptions & {
      commitLimit?: number;
    },
  ): Promise<GitRepositorySummary>;
  createFork(
    repositoryKey: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitForgeFork>;
  createRelease(
    repositoryKey: string,
    input: GitApiClientRequestOptions & {
      assets?: GitForgeReleaseAsset[];
      createTag?: {
        annotatedMessage?: string;
        name: string;
        targetRef?: string;
      };
      draft?: boolean;
      existingTagName?: string;
      notes?: string;
      prerelease?: boolean;
      publishedAt?: string | null;
      title?: string;
    },
  ): Promise<GitForgeRelease>;
  deleteRelease(
    repositoryKey: string,
    releaseId: string,
    input?: GitApiClientRequestOptions & {
      deleteTag?: boolean;
    },
  ): Promise<{
    deleted: boolean;
    release_id: string;
  }>;
  search(
    repositoryKey: string,
    options: GitApiClientRequestOptions & {
      caseSensitive?: boolean;
      limit?: number;
      path?: string;
      query: string;
      ref?: string;
      regexp?: boolean;
    },
  ): Promise<GitSearchResult>;
  request<TAction extends GitApiResource, TData>(
    repositoryKey: string,
    actionPath: string,
    options?: GitApiClientRequestOptions & {
      query?: URLSearchParams;
    },
  ): Promise<GitApiSuccessResponse<TAction, TData>>;
  starRepository(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeSocialState>;
  createWorkflow(
    repositoryKey: string,
    input: GitApiClientRequestOptions & {
      enabled?: boolean;
      env?: Record<string, string>;
      name: string;
      slug?: string;
      source?: {
        branches?: string[];
        env?: Record<string, string>;
        tags?: string[];
      };
      steps: Array<{
        env?: Record<string, string>;
        id?: string;
        name: string;
        run: string;
        shell?: string;
      }>;
      trigger: string;
    },
  ): Promise<GitForgeWorkflow>;
  runWorkflow(
    repositoryKey: string,
    input: GitApiClientRequestOptions & {
      branch?: string;
      commitHash?: string;
      ref?: string;
      triggerContext?: Record<string, unknown>;
      workflowId: string;
    },
  ): Promise<GitForgeWorkflowRun>;
  cancelWorkflowRun(
    repositoryKey: string,
    runId: string,
    options?: GitApiClientRequestOptions,
  ): Promise<GitForgeWorkflowRun>;
  syncFork(
    repositoryKey: string,
    forkId: string,
    options?: GitApiClientRequestOptions & {
      strategy?: "ff-only" | "merge";
    },
  ): Promise<GitForgeFork>;
  unstarRepository(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeSocialState>;
  unwatchRepository(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeSocialState>;
  updateRelease(
    repositoryKey: string,
    releaseId: string,
    input: GitApiClientRequestOptions & {
      assets?: GitForgeReleaseAsset[];
      draft?: boolean;
      notes?: string;
      prerelease?: boolean;
      publishedAt?: string | null;
      title?: string;
    },
  ): Promise<GitForgeRelease>;
  watchRepository(repositoryKey: string, options?: GitApiClientRequestOptions): Promise<GitForgeSocialState>;
  updateWorkflow(
    repositoryKey: string,
    workflowId: string,
    input: GitApiClientRequestOptions & {
      enabled?: boolean;
      env?: Record<string, string>;
      name?: string;
      slug?: string;
      source?: {
        branches?: string[];
        env?: Record<string, string>;
        tags?: string[];
      };
      steps?: Array<{
        env?: Record<string, string>;
        id?: string;
        name: string;
        run: string;
        shell?: string;
      }>;
      trigger?: string;
    },
  ): Promise<GitForgeWorkflow>;
};

export type {
  CreateGitApiClientOptions,
  GitApiEventStream,
  GitApiClient,
  GitApiClientFetch,
  GitApiClientHeaders,
  GitApiClientRequestOptions,
  GitApiFailureResponse,
  GitApiHeaderResolver,
  GitApiResponse,
  GitApiResource,
  GitApiSuccessResponse,
  GitForgeActivityFilters,
  GitWorkflowRunSocketDoneEvent,
  GitWorkflowRunSocketErrorEvent,
  GitWorkflowRunSocketEvent,
  GitLinguistSocketDoneEvent,
  GitLinguistSocketErrorEvent,
  GitLinguistSocketEvent,
  GitLinguistSocketProgressEvent,
  GitLinguistSocketResultEvent,
};
