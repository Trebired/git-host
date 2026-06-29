import { randomUUID } from "node:crypto";

import type {
  GitForgeActivityEntry,
  GitForgeActivityFilters,
  GitForgeActivityKind,
  GitForgeActivityRecordInput,
  GitForgeActivityStorage,
  GitForgeTransportActivityRecorder,
  GitHttpAuditEvent,
  GitRepositoryHandle,
  GitSshAuditEvent,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { runGit } from "./run_git.js";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeActivityValues<T extends string>(value: T | T[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

function normalizeActivityMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const next = Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => {
      if (!text(key) || value === undefined) return false;
      return typeof value !== "string" || value.trim() !== "";
    }),
  );
  return Object.keys(next).length ? next : undefined;
}

function compareActivityDates(left: string, right: string): number {
  const leftTime = Date.parse(text(left));
  const rightTime = Date.parse(text(right));
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }
  return text(left).localeCompare(text(right));
}

function sortActivityEntries(entries: GitForgeActivityEntry[]): GitForgeActivityEntry[] {
  return Array.from(entries).sort((left, right) => {
    const timestampDelta = compareActivityDates(text(right.created_at), text(left.created_at));
    if (timestampDelta !== 0) return timestampDelta;
    return text(right.id).localeCompare(text(left.id));
  });
}

function matchesActivityFilters(entry: GitForgeActivityEntry, filters: GitForgeActivityFilters = {}): boolean {
  const actor = text(filters.actor);
  if (actor && text(entry.actor_id) !== actor && text(entry.actor_label) !== actor) return false;

  const kinds = normalizeActivityValues(filters.kind);
  if (kinds.length && !kinds.includes(text(entry.kind))) return false;

  const sources = normalizeActivityValues(filters.source);
  if (sources.length && !sources.includes(text(entry.source))) return false;

  const createdAfter = text(filters.createdAfter);
  if (createdAfter && compareActivityDates(text(entry.created_at), createdAfter) < 0) return false;

  const createdBefore = text(filters.createdBefore);
  if (createdBefore && compareActivityDates(text(entry.created_at), createdBefore) > 0) return false;

  return true;
}

function buildActivitySummary(kind: GitForgeActivityKind, repositoryId: string, metadata: Record<string, unknown>): string {
  switch (kind) {
    case "repository.push":
      return text(metadata.branch)
        ? `Pushed ${text(metadata.branch)} in ${repositoryId}.`
        : `Pushed updates to ${repositoryId}.`;
    case "repository.pull":
      return text(metadata.branch)
        ? `Pulled ${text(metadata.branch)} in ${repositoryId}.`
        : `Pulled updates into ${repositoryId}.`;
    case "repository.fetch":
      return `Fetched updates for ${repositoryId}.`;
    case "release.create":
      return `Published release ${text(metadata.tag_name)} in ${repositoryId}.`;
    case "release.update":
      return `Updated release ${text(metadata.release_id)} in ${repositoryId}.`;
    case "release.delete":
      return `Deleted release ${text(metadata.release_id)} in ${repositoryId}.`;
    case "fork.create":
      return `Created fork ${text(metadata.fork_repository_id)} from ${repositoryId}.`;
    case "fork.sync":
      return `Synced fork ${text(metadata.fork_repository_id)} with ${repositoryId}.`;
    case "star":
      return `Starred ${repositoryId}.`;
    case "unstar":
      return `Unstarred ${repositoryId}.`;
    case "watch":
      return `Started watching ${repositoryId}.`;
    case "unwatch":
      return `Stopped watching ${repositoryId}.`;
    default:
      return `Updated ${repositoryId}.`;
  }
}

async function readRepositoryActivityContext(repository: GitRepositoryHandle): Promise<Record<string, unknown>> {
  const branchRes = await runGit(["symbolic-ref", "--short", "HEAD"], { cwd: repository.path });
  const headRes = await runGit(["rev-parse", "HEAD"], { cwd: repository.path });
  const branch = branchRes.ok ? text(branchRes.stdout) : "";
  const headCommit = headRes.ok ? text(headRes.stdout) : "";
  return normalizeActivityMetadata({
    branch,
    head_commit: headCommit,
  }) || {};
}

function deriveTransportActor(identity: unknown, fallbackLabelInput: unknown) {
  const fallbackLabel = text(fallbackLabelInput);
  if (typeof identity === "string") {
    const actorId = text(identity);
    return {
      actor_id: actorId,
      actor_label: actorId || fallbackLabel,
    };
  }
  if (identity && typeof identity === "object") {
    const record = identity as Record<string, unknown>;
    return {
      actor_id: text(record.id, text(record.userId, text(record.user_id))),
      actor_label: text(record.name, text(record.username, text(record.user, fallbackLabel))),
    };
  }
  return {
    actor_id: "",
    actor_label: fallbackLabel,
  };
}

function buildHttpActivityMetadata(event: GitHttpAuditEvent, repositoryContext: Record<string, unknown>): Record<string, unknown> {
  return normalizeActivityMetadata({
    ...repositoryContext,
    auth_identity: event.identity,
    method: event.method,
    pathname: event.pathname,
    remote_user: event.remoteUser,
    repository_key: event.repositoryKey,
    service: event.service,
    transport: "http",
    wants_write: event.wantsWrite,
  }) || {};
}

function buildSshActivityMetadata(event: GitSshAuditEvent, repositoryContext: Record<string, unknown>): Record<string, unknown> {
  return normalizeActivityMetadata({
    ...repositoryContext,
    auth_identity: event.identity,
    command: event.command,
    remote_user: event.remoteUser,
    repository_key: event.repositoryKey,
    service: event.service,
    transport: "ssh",
    username: event.username,
    wants_write: event.wantsWrite,
  }) || {};
}

function createGitForgeActivityRecorder(options: {
  now?: () => string;
  storage: GitForgeActivityStorage;
}): GitForgeTransportActivityRecorder {
  const now = typeof options.now === "function" ? options.now : nowIso;

  async function recordActivity(input: GitForgeActivityRecordInput): Promise<GitForgeActivityEntry> {
    const metadata = normalizeActivityMetadata(input.metadata);
    const repositoryId = text(input.repository_id);
    const kind = text(input.kind) as GitForgeActivityKind;
    const entry: GitForgeActivityEntry = {
      actor_id: text(input.actor_id),
      ...(text(input.actor_label) ? { actor_label: text(input.actor_label) } : {}),
      created_at: text(input.created_at, now()),
      id: text(input.id, randomUUID()),
      kind,
      ...(metadata ? { metadata } : {}),
      repository_id: repositoryId,
      ...(text(input.source) ? { source: text(input.source) as GitForgeActivityEntry["source"] } : {}),
      summary: text(input.summary, buildActivitySummary(kind, repositoryId, metadata || {})),
    };
    return await options.storage.createActivity(entry);
  }

  return {
    recordActivity,

    async listActivity(repositoryId: string, filters: GitForgeActivityFilters = {}) {
      const rows = await options.storage.listActivity(text(repositoryId), filters);
      return sortActivityEntries(Array.from(rows).filter((entry) => matchesActivityFilters(entry, filters)));
    },

    async recordHttpAuditEvent(event: GitHttpAuditEvent) {
      if (event.outcome !== "completed" || !event.repository || !event.service) return null;
      if (text(event.method).toUpperCase() !== "POST") return null;
      const repositoryContext = await readRepositoryActivityContext(event.repository);
      const actor = deriveTransportActor(event.identity, event.remoteUser);
      return await recordActivity({
        actor_id: actor.actor_id,
        actor_label: actor.actor_label,
        kind: event.service === "git-receive-pack" ? "repository.push" : "repository.fetch",
        metadata: buildHttpActivityMetadata(event, repositoryContext),
        repository_id: event.repository.id,
        source: "http",
      });
    },

    async recordSshAuditEvent(event: GitSshAuditEvent) {
      if (event.outcome !== "completed" || !event.repository || !event.service) return null;
      const repositoryContext = await readRepositoryActivityContext(event.repository);
      const actor = deriveTransportActor(event.identity, event.remoteUser || event.username);
      return await recordActivity({
        actor_id: actor.actor_id,
        actor_label: actor.actor_label,
        kind: event.service === "git-receive-pack" ? "repository.push" : "repository.fetch",
        metadata: buildSshActivityMetadata(event, repositoryContext),
        repository_id: event.repository.id,
        source: "ssh",
      });
    },
  };
}

export {
  buildActivitySummary,
  createGitForgeActivityRecorder,
  matchesActivityFilters,
  readRepositoryActivityContext,
  sortActivityEntries,
};
