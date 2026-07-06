import type {
  GitForgeActivityEntry,
  GitForgeForkStorageRecord,
  GitForgeRelease,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunArtifact,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunStep,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

type InMemoryGitForgeState = {
  activity: Map<string, GitForgeActivityEntry[]>;
  forks: Map<string, GitForgeForkStorageRecord>;
  forksByUpstream: Map<string, Set<string>>;
  releases: Map<string, Map<string, GitForgeRelease>>;
  runArtifacts: Map<string, Map<string, GitForgeWorkflowRunArtifact>>;
  runEvents: Map<string, GitForgeWorkflowRunEvent[]>;
  runJobs: Map<string, Map<string, GitForgeWorkflowRunJob>>;
  runs: Map<string, Map<string, GitForgeWorkflowRun>>;
  runSteps: Map<string, Map<string, GitForgeWorkflowRunStep>>;
  stars: Map<string, Set<string>>;
  watchers: Map<string, Set<string>>;
};

function getMapEntry<K, V>(store: Map<K, V>, key: K, factory: () => V): V {
  const existing = store.get(key);
  if (existing) return existing;
  const created = factory();
  store.set(key, created);
  return created;
}

function createInMemoryGitForgeState(): InMemoryGitForgeState {
  return {
    activity: new Map(),
    forks: new Map(),
    forksByUpstream: new Map(),
    releases: new Map(),
    runArtifacts: new Map(),
    runEvents: new Map(),
    runJobs: new Map(),
    runs: new Map(),
    runSteps: new Map(),
    stars: new Map(),
    watchers: new Map(),
  };
}

function releaseMap(state: InMemoryGitForgeState, repositoryId: string) {
  return getMapEntry(state.releases, text(repositoryId), () => new Map<string, GitForgeRelease>());
}

function relationSet(state: InMemoryGitForgeState, repositoryId: string) {
  return getMapEntry(state.forksByUpstream, text(repositoryId), () => new Set<string>());
}

function stringSet(store: Map<string, Set<string>>, repositoryId: string) {
  return getMapEntry(store, text(repositoryId), () => new Set<string>());
}

function runMap(state: InMemoryGitForgeState, repositoryId: string) {
  return getMapEntry(state.runs, text(repositoryId), () => new Map<string, GitForgeWorkflowRun>());
}

function runStepMap(state: InMemoryGitForgeState, runId: string) {
  return getMapEntry(state.runSteps, text(runId), () => new Map<string, GitForgeWorkflowRunStep>());
}

function runJobMap(state: InMemoryGitForgeState, runId: string) {
  return getMapEntry(state.runJobs, text(runId), () => new Map<string, GitForgeWorkflowRunJob>());
}

function runArtifactMap(state: InMemoryGitForgeState, runId: string) {
  return getMapEntry(state.runArtifacts, text(runId), () => new Map<string, GitForgeWorkflowRunArtifact>());
}

function runEventList(state: InMemoryGitForgeState, runId: string) {
  return getMapEntry(state.runEvents, text(runId), () => [] as GitForgeWorkflowRunEvent[]);
}

function activityList(state: InMemoryGitForgeState, repositoryId: string) {
  return getMapEntry(state.activity, text(repositoryId), () => [] as GitForgeActivityEntry[]);
}

export type { InMemoryGitForgeState };
export {
  activityList,
  createInMemoryGitForgeState,
  relationSet,
  releaseMap,
  runArtifactMap,
  runEventList,
  runJobMap,
  runMap,
  runStepMap,
  stringSet,
};
