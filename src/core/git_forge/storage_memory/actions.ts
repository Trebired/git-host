import { randomUUID } from "node:crypto";

import type {
  GitForgeActionsStorage,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunArtifact,
  GitForgeWorkflowRunArtifactFilters,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunJobFilters,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepFilters,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

import {
  runArtifactMap,
  runEventList,
  runJobMap,
  runMap,
  runStepMap,
  type InMemoryGitForgeState,
} from "./state.js";

function matchesWorkflowRunFilters(entry: GitForgeWorkflowRun, filters: GitForgeWorkflowRunFilters = {}) {
  const query = text(filters.query).toLowerCase();
  if (query && ![entry.id, entry.branch, entry.commit_hash, entry.ref, entry.summary, entry.workflow_id, entry.created_by].some((value) => text(value).toLowerCase().includes(query))) return false;
  if (text(filters.actor) && text(entry.created_by) !== text(filters.actor)) return false;
  if (text(filters.branch) && text(entry.branch) !== text(filters.branch)) return false;
  if (text(filters.ref) && text(entry.ref) !== text(filters.ref)) return false;
  if (text(filters.workflowId) && text(entry.workflow_id) !== text(filters.workflowId)) return false;
  const statuses = Array.isArray(filters.status) ? filters.status : (filters.status ? [filters.status] : []);
  if (statuses.length && !statuses.map((value) => text(value)).includes(text(entry.status))) return false;
  const triggers = Array.isArray(filters.triggerKind) ? filters.triggerKind : (filters.triggerKind ? [filters.triggerKind] : []);
  if (triggers.length && !triggers.map((value) => text(value)).includes(text(entry.trigger_kind))) return false;
  if (text(filters.createdAfter) && text(entry.created_at) < text(filters.createdAfter)) return false;
  if (text(filters.createdBefore) && text(entry.created_at) > text(filters.createdBefore)) return false;
  return true;
}

function sortWorkflowRuns(entries: GitForgeWorkflowRun[]) {
  return Array.from(entries).sort((left, right) => text(right.created_at).localeCompare(text(left.created_at)) || text(right.id).localeCompare(text(left.id)));
}

function sortWorkflowRunSteps(entries: GitForgeWorkflowRunStep[]) {
  return Array.from(entries).sort((left, right) => left.index - right.index || text(left.id).localeCompare(text(right.id)));
}

function sortWorkflowRunJobs(entries: GitForgeWorkflowRunJob[]) {
  return Array.from(entries).sort((left, right) => left.index - right.index || text(left.id).localeCompare(text(right.id)));
}

function sortWorkflowRunArtifacts(entries: GitForgeWorkflowRunArtifact[]) {
  return Array.from(entries).sort((left, right) => text(right.created_at).localeCompare(text(left.created_at)) || text(right.id).localeCompare(text(left.id)));
}

function sortWorkflowRunEvents(entries: GitForgeWorkflowRunEvent[]) {
  return Array.from(entries).sort((left, right) => left.sequence - right.sequence || text(left.id).localeCompare(text(right.id)));
}

function createRunMethods(state: InMemoryGitForgeState) {
  return {
    async createWorkflowRun(input: GitForgeWorkflowRun) {
      const run = { ...input, id: text(input.id) || randomUUID() };
      runMap(state, run.repository_id).set(run.id, run);
      return run;
    },
    async listWorkflowRuns(repositoryId: string, filters: GitForgeWorkflowRunFilters = {}) {
      return sortWorkflowRuns(Array.from(runMap(state, repositoryId).values()).filter((entry) => matchesWorkflowRunFilters(entry, filters)));
    },
    async readWorkflowRun(repositoryId: string, runId: string) {
      return runMap(state, repositoryId).get(text(runId)) || null;
    },
    async updateWorkflowRun(repositoryId: string, runId: string, input: Partial<GitForgeWorkflowRun>) {
      const current = runMap(state, repositoryId).get(text(runId));
      if (!current) return null;
      const next = { ...current, ...input };
      runMap(state, repositoryId).set(text(runId), next);
      return next;
    },
  };
}

function createRunJobMethods(state: InMemoryGitForgeState) {
  return {
    async createWorkflowRunJob(input: GitForgeWorkflowRunJob) {
      const job = { ...input, id: text(input.id) || randomUUID() };
      runJobMap(state, job.run_id).set(job.id, job);
      return job;
    },
    async listWorkflowRunJobs(runId: string, filters: GitForgeWorkflowRunJobFilters = {}) {
      const statuses = Array.isArray(filters.status) ? filters.status : (filters.status ? [filters.status] : []);
      return sortWorkflowRunJobs(Array.from(runJobMap(state, runId).values()).filter((entry) => (
        (!text(filters.jobId) || text(entry.job_id) === text(filters.jobId))
        && (!statuses.length || statuses.map((value) => text(value)).includes(text(entry.status)))
      )));
    },
    async readWorkflowRunJob(runId: string, jobRunId: string) {
      return runJobMap(state, runId).get(text(jobRunId)) || null;
    },
    async updateWorkflowRunJob(runId: string, jobRunId: string, input: Partial<GitForgeWorkflowRunJob>) {
      const current = runJobMap(state, runId).get(text(jobRunId));
      if (!current) return null;
      const next = { ...current, ...input };
      runJobMap(state, runId).set(text(jobRunId), next);
      return next;
    },
  };
}

function createRunStepMethods(state: InMemoryGitForgeState) {
  return {
    async createWorkflowRunStep(input: GitForgeWorkflowRunStep) {
      const step = { ...input, id: text(input.id) || randomUUID() };
      runStepMap(state, step.run_id).set(step.id, step);
      return step;
    },
    async listWorkflowRunSteps(runId: string, filters: GitForgeWorkflowRunStepFilters = {}) {
      const statuses = Array.isArray(filters.status) ? filters.status : (filters.status ? [filters.status] : []);
      return sortWorkflowRunSteps(Array.from(runStepMap(state, runId).values()).filter((entry) => (
        (!text(filters.jobRunId) || text(entry.job_run_id) === text(filters.jobRunId))
        && (!statuses.length || statuses.map((value) => text(value)).includes(text(entry.status)))
      )));
    },
    async updateWorkflowRunStep(runId: string, stepId: string, input: Partial<GitForgeWorkflowRunStep>) {
      const current = runStepMap(state, runId).get(text(stepId));
      if (!current) return null;
      const next = { ...current, ...input };
      runStepMap(state, runId).set(text(stepId), next);
      return next;
    },
  };
}

function createRunArtifactMethods(state: InMemoryGitForgeState) {
  return {
    async createWorkflowRunArtifact(input: GitForgeWorkflowRunArtifact) {
      const artifact = { ...input, id: text(input.id) || randomUUID() };
      runArtifactMap(state, artifact.run_id).set(artifact.id, artifact);
      return artifact;
    },
    async listWorkflowRunArtifacts(runId: string, filters: GitForgeWorkflowRunArtifactFilters = {}) {
      return sortWorkflowRunArtifacts(Array.from(runArtifactMap(state, runId).values()).filter((entry) => (
        (!text(filters.jobRunId) || text(entry.job_run_id) === text(filters.jobRunId))
        && (!text(filters.name) || text(entry.name) === text(filters.name))
      )));
    },
    async readWorkflowRunArtifact(runId: string, artifactId: string) {
      return runArtifactMap(state, runId).get(text(artifactId)) || null;
    },
  };
}

function createRunEventMethods(state: InMemoryGitForgeState) {
  return {
    async appendWorkflowRunEvent(input: GitForgeWorkflowRunEvent) {
      const rows = runEventList(state, input.run_id);
      const event = { ...input, id: text(input.id) || randomUUID(), sequence: Number(input.sequence) || rows.length + 1 };
      rows.push(event);
      return event;
    },
    async listWorkflowRunEvents(runId: string, filters: GitForgeWorkflowRunEventFilters = {}) {
      const afterSequence = Number(filters.afterSequence) || 0;
      const limit = Number(filters.limit) || 0;
      const entries = sortWorkflowRunEvents(runEventList(state, runId).filter((entry) => entry.sequence > afterSequence));
      return limit > 0 ? entries.slice(-limit) : entries;
    },
  };
}

function createInMemoryActionsStorage(state: InMemoryGitForgeState): GitForgeActionsStorage {
  return {
    ...createRunMethods(state),
    ...createRunJobMethods(state),
    ...createRunStepMethods(state),
    ...createRunArtifactMethods(state),
    ...createRunEventMethods(state),
  };
}

export { createInMemoryActionsStorage };
