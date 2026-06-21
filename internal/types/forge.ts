import type { IncomingMessage } from "node:http";

import type { MaybePromise, GitHostLogger, GitHostLoggerAdapter } from "./common.js";
import type { GitHost } from "./host.js";
import type { GitRepositoryHandle, GitRepositorySummary, GitSourceArchiveLinks } from "./repository.js";

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
  | "release.create"
  | "release.delete"
  | "release.update"
  | "star"
  | "unstar"
  | "watch"
  | "unwatch";

type GitForgeActivityEntry = {
  actor_id: string;
  created_at: string;
  id: string;
  kind: GitForgeActivityKind;
  metadata?: Record<string, unknown>;
  repository_id: string;
  summary: string;
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
  listActivity(repositoryId: string): MaybePromise<GitForgeActivityEntry[]>;
};

type GitForgeStorageAdapter = {
  activity: GitForgeActivityStorage;
  forks: GitForgeForkStorage;
  releases: GitForgeReleaseStorage;
  social: GitForgeSocialStorage;
};

type CreateGitForgeOptions = {
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
  createFork(repositoryId: string, input: CreateGitForgeForkInput): Promise<GitForgeFork>;
  createRelease(repositoryId: string, input: CreateGitForgeReleaseInput): Promise<GitForgeRelease>;
  deleteRelease(repositoryId: string, releaseId: string, input: DeleteGitForgeReleaseInput): Promise<void>;
  listActivity(repositoryId: string): Promise<GitForgeActivityEntry[]>;
  listForks(repositoryId: string): Promise<GitForgeFork[]>;
  listReleases(repositoryId: string): Promise<GitForgeRelease[]>;
  readOverview(repositoryId: string, input?: ReadGitForgeRepositoryInput): Promise<GitForgeRepositoryOverview>;
  openReleaseAsset(repositoryId: string, releaseId: string, assetId: string, input?: {
    repositoryKey?: string;
  }): Promise<GitForgeReleaseAssetDownload>;
  readRelease(repositoryId: string, releaseId: string): Promise<GitForgeRelease>;
  readSocialState(repositoryId: string, input?: ReadGitForgeRepositoryInput): Promise<GitForgeSocialState>;
  resolveReleaseAssetLink(repositoryId: string, releaseId: string, assetId: string, input?: {
    repositoryKey?: string;
  }): Promise<GitForgeReleaseAssetLink>;
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
  | "asset"
  | "fork"
  | "release"
  | "repository"
  | "social";

type GitForgeOperation =
  | "create"
  | "delete"
  | "read"
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

export type {
  CreateGitForgeApiHandlerOptions,
  CreateGitForgeForkInput,
  CreateGitForgeOptions,
  CreateGitForgeReleaseInput,
  DeleteGitForgeReleaseInput,
  GitForge,
  GitForgeActivityEntry,
  GitForgeActivityKind,
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
  ReadGitForgeRepositoryInput,
  SyncGitForgeForkInput,
  UpdateGitForgeReleaseInput,
};
