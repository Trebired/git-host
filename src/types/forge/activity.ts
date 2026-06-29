import type { MaybePromise } from "#5a0e75b6bdb8";
import type { GitHttpAuditEvent, GitSshAuditEvent } from "#2c9e26f53461";

type GitForgeActor = {
  email?: string;
  id: string;
  name?: string;
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

type GitForgeActivityStorage = {
  createActivity(input: GitForgeActivityEntry): MaybePromise<GitForgeActivityEntry>;
  listActivity(repositoryId: string, filters?: GitForgeActivityFilters): MaybePromise<GitForgeActivityEntry[]>;
};

export type {
  GitForgeActivityEntry,
  GitForgeActivityFilters,
  GitForgeActivityKind,
  GitForgeActivityRecorder,
  GitForgeActivityRecordInput,
  GitForgeActivitySource,
  GitForgeActivityStorage,
  GitForgeActor,
  GitForgeTransportActivityRecorder,
};
