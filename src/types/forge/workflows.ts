import type { MaybePromise } from "#5a0e75b6bdb8";
import type { GitRepositorySummary } from "#666a84ce027e";

import type { GitForgeActor } from "./activity.js";
import type { GitForgeRelease } from "./releases.js";
import type { GitForgeSocialState } from "./social_forks.js";

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

export type {
  CancelGitForgeWorkflowRunInput,
  CreateGitForgeActionsOptions,
  CreateGitForgeWorkflowInput,
  GitForgeActionsStorage,
  GitForgeRepositoryOverview,
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
  RunGitForgeWorkflowInput,
  UpdateGitForgeWorkflowInput,
};
