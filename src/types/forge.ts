import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { ServerOptions as SocketIoServerOptions } from "socket.io";

import type { MaybePromise, GitHostLogger, GitHostLoggerAdapter } from "./common.js";
import type { GitHost } from "./host.js";
import type { GitRepositoryHandle, GitRepositorySummary, GitSourceArchiveLinks } from "./repository.js";
import type { GitHttpAuditEvent, GitSshAuditEvent } from "./transports.js";

type GitForgeActor = {
  email?: string;
  id: string;
  name?: string;
};

type GitForgeReleaseAsset = {
  content_type?: string;
  download?: GitForgeReleaseAssetLink;
  download_url?: string;
  id: string;
  name: string;
  size?: number;
  storage_pointer?: string;
};

type GitForgeReleaseAssetLink = {
  asset_id: string;
  content_type?: string;
  file_name: string;
  href: string;
  size: number | null;
};

type GitForgeReleaseAssetDownload = {
  asset: GitForgeReleaseAsset;
  completed?: Promise<GitForgeReleaseAssetLink>;
  content?: string;
  content_type: string;
  encoding?: "base64";
  file_name: string;
  redirect_url?: string;
  size: number | null;
  stream?: NodeJS.ReadableStream;
};

type GitForgeRelease = {
  assets: GitForgeReleaseAsset[];
  author_id: string;
  created_at: string;
  draft: boolean;
  id: string;
  notes: string;
  prerelease: boolean;
  published_at: string | null;
  repository_id: string;
  source_archives?: GitSourceArchiveLinks;
  tag_name: string;
  target_ref: string;
  title: string;
  updated_at: string;
};

type CreateGitForgeReleaseInput = {
  actor: GitForgeActor;
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
};

type UpdateGitForgeReleaseInput = {
  actor: GitForgeActor;
  assets?: GitForgeReleaseAsset[];
  draft?: boolean;
  notes?: string;
  prerelease?: boolean;
  publishedAt?: string | null;
  title?: string;
};

type DeleteGitForgeReleaseInput = {
  actor: GitForgeActor;
  deleteTag?: boolean;
};

type GitForgeSocialState = {
  repository_id: string;
  star_count: number;
  viewer_has_starred: boolean;
  viewer_is_watching: boolean;
  watcher_count: number;
};

type GitForgeForkSyncStrategy = "ff-only" | "merge";

type GitForgeForkStatus = {
  ahead: number;
  behind: number;
  fork_branch: string;
  upstream_branch: string;
};

type GitForgeFork = {
  created_at: string;
  created_by: string;
  fork_repository_id: string;
  fork_status: GitForgeForkStatus;
  upstream_repository_id: string;
};

type CreateGitForgeForkInput = {
  actor: GitForgeActor;
};

type SyncGitForgeForkInput = {
  actor: GitForgeActor;
  strategy?: GitForgeForkSyncStrategy;
};

type GitForgeActivityKind =
  | "fork.create"
  | "fork.sync"
  | "repository.fetch"
  | "repository.pull"
  | "repository.push"
  | "release.create"
  | "release.delete"
  | "release.update"
  | "star"
  | "unstar"
  | "watch"
  | "unwatch"
  | (string & {});

type GitForgeActivitySource =
  | "api"
  | "forge"
  | "http"
  | "ssh"
  | "system"
  | (string & {});

type GitForgeActivityFilters = {
  actor?: string;
  createdAfter?: string;
  createdBefore?: string;
  kind?: GitForgeActivityKind | GitForgeActivityKind[];
  source?: GitForgeActivitySource | GitForgeActivitySource[];
};

type GitForgeActivityEntry = {
  actor_id: string;
  actor_label?: string;
  created_at: string;
  id: string;
  kind: GitForgeActivityKind;
  metadata?: Record<string, unknown>;
  repository_id: string;
  source?: GitForgeActivitySource;
  summary: string;
};

type GitForgeActivityRecordInput = {
  actor_id?: string;
  actor_label?: string;
  created_at?: string;
  id?: string;
  kind: GitForgeActivityKind;
  metadata?: Record<string, unknown>;
  repository_id: string;
  source?: GitForgeActivitySource;
  summary?: string;
};

type GitForgeActivityRecorder = {
  recordActivity(input: GitForgeActivityRecordInput): MaybePromise<GitForgeActivityEntry>;
};

type GitForgeTransportActivityRecorder = GitForgeActivityRecorder & {
  listActivity(repositoryId: string, filters?: GitForgeActivityFilters): MaybePromise<GitForgeActivityEntry[]>;
  recordHttpAuditEvent(event: GitHttpAuditEvent): MaybePromise<GitForgeActivityEntry | null>;
  recordSshAuditEvent(event: GitSshAuditEvent): MaybePromise<GitForgeActivityEntry | null>;
};

type GitForgeWorkflowTriggerKind =
  | "manual"
  | "push"
  | "release.create"
  | "release.update"
  | "tag.create"
  | (string & {});

type GitForgeWorkflowStep = {
  env?: Record<string, string>;
  id?: string;
  kind?: "shell";
  name: string;
  run: string;
  shell?: string;
};

type GitForgeWorkflowSource = {
  branches?: string[];
  env?: Record<string, string>;
  tags?: string[];
};

type GitForgeWorkflow = {
  definition_path: string;
  enabled: boolean;
  env?: Record<string, string>;
  id: string;
  name: string;
  origin: "file";
  repository_id: string;
  slug: string;
  source?: GitForgeWorkflowSource;
  steps: GitForgeWorkflowStep[];
  trigger: GitForgeWorkflowTriggerKind;
};

type CreateGitForgeWorkflowInput = {
  actor: GitForgeActor;
  enabled?: boolean;
  env?: Record<string, string>;
  name: string;
  slug?: string;
  source?: GitForgeWorkflowSource;
  steps: GitForgeWorkflowStep[];
  trigger: GitForgeWorkflowTriggerKind;
};

type UpdateGitForgeWorkflowInput = {
  actor: GitForgeActor;
  enabled?: boolean;
  env?: Record<string, string>;
  name?: string;
  slug?: string;
  source?: GitForgeWorkflowSource;
  steps?: GitForgeWorkflowStep[];
  trigger?: GitForgeWorkflowTriggerKind;
};

type GitForgeWorkflowRunner = {
  capabilities?: string[];
  host: string;
  id: string;
  kind: string;
  platform_version?: string;
};

type GitForgeWorkflowRunStatus =
  | "cancelled"
  | "failed"
  | "queued"
  | "running"
  | "skipped"
  | "starting"
  | "success";

type GitForgeWorkflowRun = {
  branch: string | null;
  commit_hash: string;
  created_at: string;
  created_by: string;
  current_step: string | null;
  current_step_index: number | null;
  finished_at: string | null;
  id: string;
  ref: string;
  release_id?: string | null;
  repository_id: string;
  runner?: GitForgeWorkflowRunner | null;
  started_at: string | null;
  status: GitForgeWorkflowRunStatus;
  summary: string;
  trigger_context?: Record<string, unknown>;
  trigger_kind: GitForgeWorkflowTriggerKind;
  workflow_id: string;
};

type GitForgeWorkflowRunStepStatus =
  | "cancelled"
  | "failed"
  | "queued"
  | "running"
  | "skipped"
  | "success";

type GitForgeWorkflowRunStep = {
  command: string;
  exit_code: number | null;
  finished_at: string | null;
  id: string;
  index: number;
  kind: "shell";
  metadata?: Record<string, unknown>;
  name: string;
  output_preview: string;
  run_id: string;
  started_at: string | null;
  status: GitForgeWorkflowRunStepStatus;
};

type GitForgeWorkflowRunEventType =
  | "run.accepted"
  | "run.cancelled"
  | "run.failed"
  | "run.finished"
  | "run.status"
  | "step.finished"
  | "step.heartbeat"
  | "step.output"
  | "step.started";

type GitForgeWorkflowRunEvent = {
  chunk?: string;
  command?: string;
  created_at: string;
  id: string;
  metadata?: Record<string, unknown>;
  repository_id: string;
  run_id: string;
  sequence: number;
  status?: GitForgeWorkflowRunStatus | GitForgeWorkflowRunStepStatus;
  step_id?: string;
  step_index?: number;
  step_name?: string;
  stream?: "stderr" | "stdout";
  summary?: string;
  type: GitForgeWorkflowRunEventType;
  workflow_id: string;
};

type GitForgeWorkflowFilters = {
  enabled?: boolean;
  query?: string;
  trigger?: GitForgeWorkflowTriggerKind | GitForgeWorkflowTriggerKind[];
};

type GitForgeWorkflowRunFilters = {
  actor?: string;
  branch?: string;
  createdAfter?: string;
  createdBefore?: string;
  query?: string;
  ref?: string;
  status?: GitForgeWorkflowRunStatus | GitForgeWorkflowRunStatus[];
  triggerKind?: GitForgeWorkflowTriggerKind | GitForgeWorkflowTriggerKind[];
  workflowId?: string;
};

type GitForgeWorkflowRunEventFilters = {
  afterSequence?: number;
  limit?: number;
};

type RunGitForgeWorkflowInput = {
  actor: GitForgeActor;
  branch?: string;
  commitHash?: string;
  ref?: string;
  triggerContext?: Record<string, unknown>;
};

type CancelGitForgeWorkflowRunInput = {
  actor: GitForgeActor;
};

type GitForgeWorkflowRunSocketSubscription = {
  close: () => void;
};

type GitForgeRepositoryOverview = {
  activity_count: number;
  fork_count: number;
  latest_release: GitForgeRelease | null;
  release_count: number;
  repository: GitRepositorySummary;
  social: GitForgeSocialState;
};

type GitForgeReleaseAssetStore = {
  buildAssetDownloadUrl?: (input: {
    asset: GitForgeReleaseAsset;
    release: GitForgeRelease;
    repositoryId: string;
    repositoryKey?: string;
  }) => string | null | undefined;
  normalizeAssets?: (
    repositoryId: string,
    assets: GitForgeReleaseAsset[],
  ) => MaybePromise<GitForgeReleaseAsset[]>;
  openAssetDownload?: (input: {
    asset: GitForgeReleaseAsset;
    release: GitForgeRelease;
    repositoryId: string;
    repositoryKey?: string;
  }) => MaybePromise<GitForgeReleaseAssetDownload | null>;
};

type GitForgeReleaseStorage = {
  createRelease(input: GitForgeRelease): MaybePromise<GitForgeRelease>;
  deleteRelease(repositoryId: string, releaseId: string): MaybePromise<GitForgeRelease | null>;
  listReleases(repositoryId: string): MaybePromise<GitForgeRelease[]>;
  readRelease(repositoryId: string, releaseId: string): MaybePromise<GitForgeRelease | null>;
  updateRelease(
    repositoryId: string,
    releaseId: string,
    input: Partial<Omit<GitForgeRelease, "author_id" | "created_at" | "id" | "repository_id" | "tag_name" | "target_ref">>,
  ): MaybePromise<GitForgeRelease | null>;
};

type GitForgeSocialStorage = {
  listStars?(repositoryId: string): MaybePromise<string[]>;
  listWatchers?(repositoryId: string): MaybePromise<string[]>;
  setStar(repositoryId: string, actorId: string, starred: boolean): MaybePromise<void>;
  setWatching(repositoryId: string, actorId: string, watching: boolean): MaybePromise<void>;
  viewerHasStarred(repositoryId: string, actorId: string): MaybePromise<boolean>;
  viewerIsWatching(repositoryId: string, actorId: string): MaybePromise<boolean>;
};

type GitForgeForkStorageRecord = {
  created_at: string;
  created_by: string;
  fork_repository_id: string;
  upstream_repository_id: string;
};

type GitForgeForkStorage = {
  createFork(input: GitForgeForkStorageRecord): MaybePromise<GitForgeForkStorageRecord>;
  listForks(repositoryId: string): MaybePromise<GitForgeForkStorageRecord[]>;
  readFork(forkRepositoryId: string): MaybePromise<GitForgeForkStorageRecord | null>;
};

type GitForgeActivityStorage = {
  createActivity(input: GitForgeActivityEntry): MaybePromise<GitForgeActivityEntry>;
  listActivity(repositoryId: string, filters?: GitForgeActivityFilters): MaybePromise<GitForgeActivityEntry[]>;
};

type GitForgeActionsStorage = {
  appendWorkflowRunEvent(input: GitForgeWorkflowRunEvent): MaybePromise<GitForgeWorkflowRunEvent>;
  createWorkflowRun(input: GitForgeWorkflowRun): MaybePromise<GitForgeWorkflowRun>;
  createWorkflowRunStep(input: GitForgeWorkflowRunStep): MaybePromise<GitForgeWorkflowRunStep>;
  listWorkflowRunEvents(runId: string, filters?: GitForgeWorkflowRunEventFilters): MaybePromise<GitForgeWorkflowRunEvent[]>;
  listWorkflowRunSteps(runId: string): MaybePromise<GitForgeWorkflowRunStep[]>;
  listWorkflowRuns(repositoryId: string, filters?: GitForgeWorkflowRunFilters): MaybePromise<GitForgeWorkflowRun[]>;
  readWorkflowRun(repositoryId: string, runId: string): MaybePromise<GitForgeWorkflowRun | null>;
  updateWorkflowRun(
    repositoryId: string,
    runId: string,
    input: Partial<Omit<GitForgeWorkflowRun, "created_at" | "created_by" | "id" | "repository_id" | "workflow_id">>,
  ): MaybePromise<GitForgeWorkflowRun | null>;
  updateWorkflowRunStep(
    runId: string,
    stepId: string,
    input: Partial<Omit<GitForgeWorkflowRunStep, "command" | "id" | "index" | "kind" | "name" | "run_id">>,
  ): MaybePromise<GitForgeWorkflowRunStep | null>;
};

type GitForgeStorageAdapter = {
  activity: GitForgeActivityStorage;
  actions?: GitForgeActionsStorage;
  forks: GitForgeForkStorage;
  releases: GitForgeReleaseStorage;
  social: GitForgeSocialStorage;
};

type CreateGitForgeActionsOptions = {
  env?: Record<string, string>;
  heartbeatIntervalMs?: number;
  redactOutput?: (input: {
    chunk: string;
    run: GitForgeWorkflowRun;
    step: GitForgeWorkflowRunStep;
    stream: "stderr" | "stdout";
  }) => MaybePromise<string>;
  runner?: Partial<GitForgeWorkflowRunner>;
  runnerBinaryPath?: string;
  resolveWorkflowRoot?: (repositoryId: string) => MaybePromise<string | null | undefined>;
  shell?: string;
  workflowRoot?: string;
  workspaceRoot?: string;
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
  listWorkflowRunEvents(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunEventFilters): Promise<GitForgeWorkflowRunEvent[]>;
  listWorkflowRunSteps(repositoryId: string, runId: string): Promise<GitForgeWorkflowRunStep[]>;
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
  CancelGitForgeWorkflowRunInput,
  CreateGitForgeActionsOptions,
  CreateGitForgeApiHandlerOptions,
  CreateGitForgeSocketServerOptions,
  GitForgeActivityFilters,
  CreateGitForgeWorkflowInput,
  CreateGitForgeForkInput,
  CreateGitForgeOptions,
  CreateGitForgeReleaseInput,
  DeleteGitForgeReleaseInput,
  GitForge,
  GitForgeActivityEntry,
  GitForgeActivityKind,
  GitForgeActivityRecordInput,
  GitForgeActivityRecorder,
  GitForgeActivityStorage,
  GitForgeActivitySource,
  GitForgeActionsStorage,
  GitForgeTransportActivityRecorder,
  GitForgeActor,
  GitForgeApiAuthorizationResult,
  GitForgeFork,
  GitForgeForkStatus,
  GitForgeForkStorage,
  GitForgeForkStorageRecord,
  GitForgeForkSyncStrategy,
  GitForgeOperation,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetDownload,
  GitForgeReleaseAssetLink,
  GitForgeReleaseAssetStore,
  GitForgeReleaseStorage,
  GitForgeRepositoryOverview,
  GitForgeResource,
  GitForgeSocialState,
  GitForgeSocialStorage,
  GitForgeStorageAdapter,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunner,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunEventType,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunSocketSubscription,
  GitForgeWorkflowRunStatus,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepStatus,
  GitForgeWorkflowSource,
  GitForgeWorkflowStep,
  GitForgeWorkflowTriggerKind,
  ReadGitForgeRepositoryInput,
  RunGitForgeWorkflowInput,
  SyncGitForgeForkInput,
  UpdateGitForgeReleaseInput,
  UpdateGitForgeWorkflowInput,
};
