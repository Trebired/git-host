import { randomUUID } from "node:crypto";

import type {
  GitForgeActivityEntry,
  GitForgeStorageAdapter,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { matchesActivityFilters, sortActivityEntries } from "#yotdvtav6ika";

import { createInMemoryActionsStorage } from "./actions.js";
import {
  activityList,
  createInMemoryGitForgeState,
  relationSet,
  releaseMap,
  stringSet,
} from "./state.js";

function createReleaseStorage(state: ReturnType<typeof createInMemoryGitForgeState>) {
  return {
    async createRelease(input: any) {
      const release = { ...input, id: text(input.id) || randomUUID() };
      releaseMap(state, release.repository_id).set(release.id, release);
      return release;
    },
    async deleteRelease(repositoryId: string, releaseId: string) {
      const map = releaseMap(state, repositoryId);
      const current = map.get(text(releaseId)) || null;
      map.delete(text(releaseId));
      return current;
    },
    async listReleases(repositoryId: string) {
      return Array.from(releaseMap(state, repositoryId).values());
    },
    async readRelease(repositoryId: string, releaseId: string) {
      return releaseMap(state, repositoryId).get(text(releaseId)) || null;
    },
    async updateRelease(repositoryId: string, releaseId: string, input: Record<string, unknown>) {
      const current = releaseMap(state, repositoryId).get(text(releaseId));
      if (!current) return null;
      const next = { ...current, ...input };
      releaseMap(state, repositoryId).set(text(releaseId), next as any);
      return next;
    },
  };
}

function createSocialStorage(state: ReturnType<typeof createInMemoryGitForgeState>) {
  return {
    async listStars(repositoryId: string) {
      return Array.from(stringSet(state.stars, repositoryId));
    },
    async listWatchers(repositoryId: string) {
      return Array.from(stringSet(state.watchers, repositoryId));
    },
    async setStar(repositoryId: string, actorId: string, starred: boolean) {
      const set = stringSet(state.stars, repositoryId);
      if (starred) set.add(text(actorId));
      else set.delete(text(actorId));
    },
    async setWatching(repositoryId: string, actorId: string, watching: boolean) {
      const set = stringSet(state.watchers, repositoryId);
      if (watching) set.add(text(actorId));
      else set.delete(text(actorId));
    },
    async viewerHasStarred(repositoryId: string, actorId: string) {
      return stringSet(state.stars, repositoryId).has(text(actorId));
    },
    async viewerIsWatching(repositoryId: string, actorId: string) {
      return stringSet(state.watchers, repositoryId).has(text(actorId));
    },
  };
}

function createForkStorage(state: ReturnType<typeof createInMemoryGitForgeState>) {
  return {
    async createFork(input: any) {
      const record = {
        ...input,
        created_at: text(input.created_at),
        created_by: text(input.created_by),
        fork_repository_id: text(input.fork_repository_id),
        upstream_repository_id: text(input.upstream_repository_id),
      };
      state.forks.set(record.fork_repository_id, record);
      relationSet(state, record.upstream_repository_id).add(record.fork_repository_id);
      return record;
    },
    async listForks(repositoryId: string) {
      return Array.from(relationSet(state, repositoryId))
        .map((forkRepositoryId) => state.forks.get(forkRepositoryId) || null)
        .filter(Boolean);
    },
    async readFork(forkRepositoryId: string) {
      return state.forks.get(text(forkRepositoryId)) || null;
    },
  };
}

function createActivityStorage(state: ReturnType<typeof createInMemoryGitForgeState>) {
  return {
    async createActivity(input: GitForgeActivityEntry) {
      const entry = {
        ...input,
        actor_id: text(input.actor_id),
        ...(text(input.actor_label) ? { actor_label: text(input.actor_label) } : {}),
        id: text(input.id) || randomUUID(),
        ...(text(input.source) ? { source: text(input.source) as GitForgeActivityEntry["source"] } : {}),
      };
      activityList(state, entry.repository_id).push(entry);
      return entry;
    },
    async listActivity(repositoryId: string, filters = {}) {
      return sortActivityEntries(Array.from(activityList(state, repositoryId)).filter((entry) => matchesActivityFilters(entry, filters as any)));
    },
  };
}

function createInMemoryGitForgeStorageAdapter(): GitForgeStorageAdapter {
  const state = createInMemoryGitForgeState();
  return {
    actions: createInMemoryActionsStorage(state),
    activity: createActivityStorage(state),
    forks: createForkStorage(state),
    releases: createReleaseStorage(state),
    social: createSocialStorage(state),
  };
}

export { createInMemoryGitForgeStorageAdapter };
