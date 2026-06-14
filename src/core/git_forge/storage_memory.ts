import { randomUUID } from "node:crypto";

import type {
  GitForgeActivityEntry,
  GitForgeForkStorageRecord,
  GitForgeRelease,
  GitForgeStorageAdapter,
} from "../../types.js";
import { text } from "../../utils/text.js";

function createInMemoryGitForgeStorageAdapter(): GitForgeStorageAdapter {
  const releases = new Map<string, Map<string, GitForgeRelease>>();
  const stars = new Map<string, Set<string>>();
  const watchers = new Map<string, Set<string>>();
  const forks = new Map<string, GitForgeForkStorageRecord>();
  const forksByUpstream = new Map<string, Set<string>>();
  const activity = new Map<string, GitForgeActivityEntry[]>();

  function releaseMap(repositoryId: string) {
    const key = text(repositoryId);
    let current = releases.get(key);
    if (!current) {
      current = new Map();
      releases.set(key, current);
    }
    return current;
  }

  function relationSet(repositoryId: string) {
    const key = text(repositoryId);
    let current = forksByUpstream.get(key);
    if (!current) {
      current = new Set();
      forksByUpstream.set(key, current);
    }
    return current;
  }

  function stringSet(store: Map<string, Set<string>>, repositoryId: string) {
    const key = text(repositoryId);
    let current = store.get(key);
    if (!current) {
      current = new Set();
      store.set(key, current);
    }
    return current;
  }

  return {
    releases: {
      async listReleases(repositoryId: string) {
        return Array.from(releaseMap(repositoryId).values());
      },
      async readRelease(repositoryId: string, releaseId: string) {
        return releaseMap(repositoryId).get(text(releaseId)) || null;
      },
      async createRelease(input: GitForgeRelease) {
        const release = {
          ...input,
          id: text(input.id) || randomUUID(),
        };
        releaseMap(release.repository_id).set(release.id, release);
        return release;
      },
      async updateRelease(repositoryId: string, releaseId: string, input) {
        const current = releaseMap(repositoryId).get(text(releaseId));
        if (!current) return null;
        const next = {
          ...current,
          ...input,
        };
        releaseMap(repositoryId).set(text(releaseId), next);
        return next;
      },
      async deleteRelease(repositoryId: string, releaseId: string) {
        const map = releaseMap(repositoryId);
        const current = map.get(text(releaseId)) || null;
        map.delete(text(releaseId));
        return current;
      },
    },
    social: {
      async listStars(repositoryId: string) {
        return Array.from(stringSet(stars, repositoryId));
      },
      async listWatchers(repositoryId: string) {
        return Array.from(stringSet(watchers, repositoryId));
      },
      async setStar(repositoryId: string, actorId: string, starred: boolean) {
        const set = stringSet(stars, repositoryId);
        if (starred) set.add(text(actorId));
        else set.delete(text(actorId));
      },
      async setWatching(repositoryId: string, actorId: string, watching: boolean) {
        const set = stringSet(watchers, repositoryId);
        if (watching) set.add(text(actorId));
        else set.delete(text(actorId));
      },
      async viewerHasStarred(repositoryId: string, actorId: string) {
        return stringSet(stars, repositoryId).has(text(actorId));
      },
      async viewerIsWatching(repositoryId: string, actorId: string) {
        return stringSet(watchers, repositoryId).has(text(actorId));
      },
    },
    forks: {
      async createFork(input: GitForgeForkStorageRecord) {
        const record = {
          ...input,
          created_at: text(input.created_at),
          created_by: text(input.created_by),
          fork_repository_id: text(input.fork_repository_id),
          upstream_repository_id: text(input.upstream_repository_id),
        };
        forks.set(record.fork_repository_id, record);
        relationSet(record.upstream_repository_id).add(record.fork_repository_id);
        return record;
      },
      async listForks(repositoryId: string) {
        return Array.from(relationSet(repositoryId))
          .map((forkRepositoryId) => forks.get(forkRepositoryId) || null)
          .filter(Boolean);
      },
      async readFork(forkRepositoryId: string) {
        return forks.get(text(forkRepositoryId)) || null;
      },
    },
    activity: {
      async createActivity(input: GitForgeActivityEntry) {
        const entry = {
          ...input,
          id: text(input.id) || randomUUID(),
        };
        const key = text(entry.repository_id);
        const rows = activity.get(key) || [];
        rows.push(entry);
        activity.set(key, rows);
        return entry;
      },
      async listActivity(repositoryId: string) {
        return Array.from(activity.get(text(repositoryId)) || []);
      },
    },
  };
}

export { createInMemoryGitForgeStorageAdapter };
