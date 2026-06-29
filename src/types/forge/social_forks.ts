import type { MaybePromise } from "#5a0e75b6bdb8";

import type { GitForgeActor } from "./activity.js";

type GitForgeSocialState = {
  repository_id: string;
  star_count: number;
  viewer_has_starred: boolean;
  viewer_is_watching: boolean;
  watcher_count: number;
};

type GitForgeSocialStorage = {
  listStars?(repositoryId: string): MaybePromise<string[]>;
  listWatchers?(repositoryId: string): MaybePromise<string[]>;
  setStar(repositoryId: string, actorId: string, starred: boolean): MaybePromise<void>;
  setWatching(repositoryId: string, actorId: string, watching: boolean): MaybePromise<void>;
  viewerHasStarred(repositoryId: string, actorId: string): MaybePromise<boolean>;
  viewerIsWatching(repositoryId: string, actorId: string): MaybePromise<boolean>;
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

export type {
  CreateGitForgeForkInput,
  GitForgeFork,
  GitForgeForkStatus,
  GitForgeForkStorage,
  GitForgeForkStorageRecord,
  GitForgeForkSyncStrategy,
  GitForgeSocialState,
  GitForgeSocialStorage,
  SyncGitForgeForkInput,
};
