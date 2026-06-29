import { randomUUID } from "node:crypto";

import type {
  GitForgeActivityFilters,
  GitForgeActivityEntry,
  GitForgeActionsStorage,
  GitForgeForkStorageRecord,
  GitForgeRelease,
  GitForgeStorageAdapter,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunStep,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { matchesActivityFilters, sortActivityEntries } from "#yotdvtav6ika";

function createInMemoryGitForgeStorageAdapter(): GitForgeStorageAdapter {
  const releases = new Map<string, Map<string, GitForgeRelease>>();
  const stars = new Map<string, Set<string>>();
  const watchers = new Map<string, Set<string>>();
  const forks = new Map<string, GitForgeForkStorageRecord>();
  const forksByUpstream = new Map<string, Set<string>>();
  const activity = new Map<string, GitForgeActivityEntry[]>();
  const runs = new Map<string, Map<string, GitForgeWorkflowRun>>();
  const runSteps = new Map<string, Map<string, GitForgeWorkflowRunStep>>();
  const runEvents = new Map<string, GitForgeWorkflowRunEvent[]>();

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

  function runMap(repositoryId: string) {
    const key = text(repositoryId);
    let current = runs.get(key);
    if (!current) {
      current = new Map();
      runs.set(key, current);
    }
    return current;
  }

  function runStepMap(runId: string) {
    const key = text(runId);
    let current = runSteps.get(key);
    if (!current) {
      current = new Map();
      runSteps.set(key, current);
    }
    return current;
  }

  function runEventList(runId: string) {
    const key = text(runId);
    let current = runEvents.get(key);
    if (!current) {
      current = [];
      runEvents.set(key, current);
    }
    return current;
  }

  function matchesWorkflowRunFilters(entry: GitForgeWorkflowRun, filters: GitForgeWorkflowRunFilters = {}) {
    const query = text(filters.query).toLowerCase();
    if (query && ![
      entry.id,
      entry.branch,
      entry.commit_hash,
      entry.ref,
      entry.summary,
      entry.workflow_id,
      entry.created_by,
    ].some((value) => text(value).toLowerCase().includes(query))) return false;
    if (text(filters.actor) && text(entry.created_by) !== text(filters.actor)) return false;
    if (text(filters.branch) && text(entry.branch) !== text(filters.branch)) return false;
    if (text(filters.ref) && text(entry.ref) !== text(filters.ref)) return false;
    if (text(filters.workflowId) && text(entry.workflow_id) !== text(filters.workflowId)) return false;
    const statuses = Array.isArray(filters.status) ? filters.status : (filters.status ? [filters.status] : []);
    if (statuses.length && !statuses.map((value) => text(value)).includes(text(entry.status))) return false;
    const triggers = Array.isArray(filters.triggerKind) ? filters.triggerKind : (filters.triggerKind ? [filters.triggerKind] : []);
    if (triggers.length && !triggers.map((value) => text(value)).includes(text(entry.trigger_kind))) return false;
    const createdAfter = text(filters.createdAfter);
    if (createdAfter && text(entry.created_at) < createdAfter) return false;
    const createdBefore = text(filters.createdBefore);
    if (createdBefore && text(entry.created_at) > createdBefore) return false;
    return true;
  }

  function sortWorkflowRuns(entries: GitForgeWorkflowRun[]) {
    return Array.from(entries).sort((left, right) => text(right.created_at).localeCompare(text(left.created_at)) || text(right.id).localeCompare(text(left.id)));
  }

  function sortWorkflowRunSteps(entries: GitForgeWorkflowRunStep[]) {
    return Array.from(entries).sort((left, right) => left.index - right.index || text(left.id).localeCompare(text(right.id)));
  }

  function sortWorkflowRunEvents(entries: GitForgeWorkflowRunEvent[]) {
    return Array.from(entries).sort((left, right) => left.sequence - right.sequence || text(left.id).localeCompare(text(right.id)));
  }

  const actions: GitForgeActionsStorage = {
    async createWorkflowRun(input: GitForgeWorkflowRun) {
      const run = {
        ...input,
        id: text(input.id) || randomUUID(),
      };
      runMap(run.repository_id).set(run.id, run);
      return run;
    },
    async readWorkflowRun(repositoryId: string, runId: string) {
      return runMap(repositoryId).get(text(runId)) || null;
    },
    async listWorkflowRuns(repositoryId: string, filters: GitForgeWorkflowRunFilters = {}) {
      return sortWorkflowRuns(
        Array.from(runMap(repositoryId).values()).filter((entry) => matchesWorkflowRunFilters(entry, filters)),
      );
    },
    async updateWorkflowRun(repositoryId: string, runId: string, input) {
      const current = runMap(repositoryId).get(text(runId));
      if (!current) return null;
      const next = {
        ...current,
        ...input,
      };
      runMap(repositoryId).set(text(runId), next);
      return next;
    },
    async createWorkflowRunStep(input: GitForgeWorkflowRunStep) {
      const step = {
        ...input,
        id: text(input.id) || randomUUID(),
      };
      runStepMap(step.run_id).set(step.id, step);
      return step;
    },
    async listWorkflowRunSteps(runId: string) {
      return sortWorkflowRunSteps(Array.from(runStepMap(runId).values()));
    },
    async updateWorkflowRunStep(runId: string, stepId: string, input) {
      const current = runStepMap(runId).get(text(stepId));
      if (!current) return null;
      const next = {
        ...current,
        ...input,
      };
      runStepMap(runId).set(text(stepId), next);
      return next;
    },
    async appendWorkflowRunEvent(input: GitForgeWorkflowRunEvent) {
      const rows = runEventList(input.run_id);
      const event = {
        ...input,
        id: text(input.id) || randomUUID(),
        sequence: Number(input.sequence) || rows.length + 1,
      };
      rows.push(event);
      return event;
    },
    async listWorkflowRunEvents(runId: string, filters: GitForgeWorkflowRunEventFilters = {}) {
      const afterSequence = Number(filters.afterSequence) || 0;
      const limit = Number(filters.limit) || 0;
      const entries = sortWorkflowRunEvents(
        runEventList(runId).filter((entry) => entry.sequence > afterSequence),
      );
      return limit > 0 ? entries.slice(-limit) : entries;
    },
  };

  return {
    actions,
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
          actor_id: text(input.actor_id),
          ...(text(input.actor_label) ? { actor_label: text(input.actor_label) } : {}),
          id: text(input.id) || randomUUID(),
          ...(text(input.source) ? { source: text(input.source) as GitForgeActivityEntry["source"] } : {}),
        };
        const key = text(entry.repository_id);
        const rows = activity.get(key) || [];
        rows.push(entry);
        activity.set(key, rows);
        return entry;
      },
      async listActivity(repositoryId: string, filters: GitForgeActivityFilters = {}) {
        return sortActivityEntries(
          Array.from(activity.get(text(repositoryId)) || []).filter((entry) => matchesActivityFilters(entry, filters)),
        );
      },
    },
  };
}

export { createInMemoryGitForgeStorageAdapter };
