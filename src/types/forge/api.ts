import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { ServerOptions as SocketIoServerOptions } from "socket.io";

import type { MaybePromise, GitHostLogger, GitHostLoggerAdapter } from "#5a0e75b6bdb8";
import type { GitHost } from "#59b3abcebf1a";
import type { GitRepositoryHandle } from "#666a84ce027e";

import type {
  GitForgeActivityEntry,
  GitForgeActivityFilters,
  GitForgeActor,
  GitForgeActivityStorage,
} from "./activity.js";
import type {
  GitForgeRelease,
  GitForgeReleaseAssetDownload,
  GitForgeReleaseAssetLink,
  GitForgeReleaseAssetStore,
  GitForgeReleaseStorage,
  CreateGitForgeReleaseInput,
  DeleteGitForgeReleaseInput,
  UpdateGitForgeReleaseInput,
} from "./releases.js";
import type {
  CreateGitForgeForkInput,
  GitForgeFork,
  GitForgeForkStorage,
  GitForgeSocialState,
  GitForgeSocialStorage,
  SyncGitForgeForkInput,
} from "./social_forks.js";
import type {
  CancelGitForgeWorkflowRunInput,
  CreateGitForgeActionsOptions,
  GitForgeActionsStorage,
  GitForgeRepositoryOverview,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRunArtifact,
  GitForgeWorkflowRunArtifactFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunJobFilters,
  GitForgeWorkflowRunSocketSubscription,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepFilters,
  RunGitForgeWorkflowInput,
} from "./workflows.js";

type GitForgeStorageAdapter = {
  activity: GitForgeActivityStorage;
  actions?: GitForgeActionsStorage;
  forks: GitForgeForkStorage;
  releases: GitForgeReleaseStorage;
  social: GitForgeSocialStorage;
};

type CreateGitForgeOptions = {
  actions?: CreateGitForgeActionsOptions;
  createForkRepository: (input: {
    actor: GitForgeActor;
    upstreamRepository: GitRepositoryHandle;
    upstreamRepositoryId: string;
  }) => MaybePromise<GitRepositoryHandle>;
  gitHost: GitHost;
  logger?: GitHostLogger;
  loggerAdapter?: GitHostLoggerAdapter;
  releaseAssetStore?: GitForgeReleaseAssetStore;
  storage: GitForgeStorageAdapter;
  verbose?: boolean;
};

type ReadGitForgeRepositoryInput = {
  actorId?: string;
};

type GitForge = {
  cancelWorkflowRun(repositoryId: string, runId: string, input: CancelGitForgeWorkflowRunInput): Promise<GitForgeWorkflowRun>;
  createFork(repositoryId: string, input: CreateGitForgeForkInput): Promise<GitForgeFork>;
  createRelease(repositoryId: string, input: CreateGitForgeReleaseInput): Promise<GitForgeRelease>;
  deleteRelease(repositoryId: string, releaseId: string, input: DeleteGitForgeReleaseInput): Promise<void>;
  listActivity(repositoryId: string, filters?: GitForgeActivityFilters): Promise<GitForgeActivityEntry[]>;
  listForks(repositoryId: string): Promise<GitForgeFork[]>;
  listReleases(repositoryId: string): Promise<GitForgeRelease[]>;
  listWorkflowRunArtifacts(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunArtifactFilters): Promise<GitForgeWorkflowRunArtifact[]>;
  listWorkflowRunEvents(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunEventFilters): Promise<GitForgeWorkflowRunEvent[]>;
  listWorkflowRunJobs(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunJobFilters): Promise<GitForgeWorkflowRunJob[]>;
  listWorkflowRunSteps(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunStepFilters): Promise<GitForgeWorkflowRunStep[]>;
  listWorkflowRuns(repositoryId: string, filters?: GitForgeWorkflowRunFilters): Promise<GitForgeWorkflowRun[]>;
  listWorkflows(repositoryId: string, filters?: GitForgeWorkflowFilters): Promise<GitForgeWorkflow[]>;
  readOverview(repositoryId: string, input?: ReadGitForgeRepositoryInput): Promise<GitForgeRepositoryOverview>;
  openReleaseAsset(repositoryId: string, releaseId: string, assetId: string, input?: {
    repositoryKey?: string;
  }): Promise<GitForgeReleaseAssetDownload>;
  readRelease(repositoryId: string, releaseId: string): Promise<GitForgeRelease>;
  readSocialState(repositoryId: string, input?: ReadGitForgeRepositoryInput): Promise<GitForgeSocialState>;
  readWorkflow(repositoryId: string, workflowId: string): Promise<GitForgeWorkflow>;
  readWorkflowRun(repositoryId: string, runId: string): Promise<GitForgeWorkflowRun>;
  resolveReleaseAssetLink(repositoryId: string, releaseId: string, assetId: string, input?: {
    repositoryKey?: string;
  }): Promise<GitForgeReleaseAssetLink>;
  runWorkflow(repositoryId: string, workflowId: string, input: RunGitForgeWorkflowInput): Promise<GitForgeWorkflowRun>;
  subscribeWorkflowRun(repositoryId: string, runId: string, listener: (event: GitForgeWorkflowRunEvent) => MaybePromise<void>): GitForgeWorkflowRunSocketSubscription;
  syncFork(forkRepositoryId: string, input: SyncGitForgeForkInput): Promise<GitForgeFork>;
  unstarRepository(repositoryId: string, input: { actor: GitForgeActor }): Promise<GitForgeSocialState>;
  unwatchRepository(repositoryId: string, input: { actor: GitForgeActor }): Promise<GitForgeSocialState>;
  updateRelease(repositoryId: string, releaseId: string, input: UpdateGitForgeReleaseInput): Promise<GitForgeRelease>;
  watchRepository(repositoryId: string, input: { actor: GitForgeActor }): Promise<GitForgeSocialState>;
  starRepository(repositoryId: string, input: { actor: GitForgeActor }): Promise<GitForgeSocialState>;
};

type GitForgeApiAuthorizationResult = boolean | {
  allowed: boolean;
  headers?: Record<string, string>;
  message?: string;
  status?: number;
};

type GitForgeResource =
  | "activity"
  | "action_run"
  | "action_workflow"
  | "actions"
  | "asset"
  | "fork"
  | "release"
  | "repository"
  | "social";

type GitForgeOperation =
  | "cancel"
  | "create"
  | "delete"
  | "read"
  | "run"
  | "subscribe"
  | "sync"
  | "update";

type CreateGitForgeApiHandlerOptions = {
  authorize?: (input: {
    action: string;
    actor: GitForgeActor | null;
    assetId?: string;
    method: string;
    operation: GitForgeOperation;
    pathname: string;
    runId?: string;
    releaseId?: string;
    remoteAddress: string;
    repositoryId: string;
    repositoryKey: string;
    request: IncomingMessage;
    resource: GitForgeResource;
    searchParams: URLSearchParams;
  }) => MaybePromise<GitForgeApiAuthorizationResult>;
  basePath?: string;
  forge: GitForge;
  gitHost: GitHost;
  logger?: GitHostLogger;
  loggerAdapter?: GitHostLoggerAdapter;
  resolveActor?: (request: IncomingMessage) => MaybePromise<GitForgeActor | null>;
  resolveRepositoryId?: (
    repositoryKey: string,
    request: IncomingMessage,
  ) => MaybePromise<string | null>;
  verbose?: boolean;
};

type CreateGitForgeSocketServerOptions = CreateGitForgeApiHandlerOptions & {
  httpServer: HttpServer;
  socketOptions?: Partial<SocketIoServerOptions>;
  socketPath?: string;
};

export type {
  CreateGitForgeApiHandlerOptions,
  CreateGitForgeOptions,
  CreateGitForgeSocketServerOptions,
  GitForge,
  GitForgeApiAuthorizationResult,
  GitForgeOperation,
  GitForgeResource,
  GitForgeStorageAdapter,
  ReadGitForgeRepositoryInput,
};
