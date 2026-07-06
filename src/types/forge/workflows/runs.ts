import type { MaybePromise } from "#5a0e75b6bdb8";
import type { GitRepositorySummary } from "#666a84ce027e";

import type { GitForgeActor } from "#rifbqbjmjgxy";
import type { GitForgeRelease } from "#g3n8cscehpt3";
import type { GitForgeSocialState } from "#fznhyzk6jqlm";
import type { GitForgeWorkflow, GitForgeWorkflowTriggerKind } from "./definition.js";

type GitForgeWorkflowRunner = {
  capabilities?: string[];
  host: string;
  id: string;
  kind: string;
  labels?: string[];
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
  concurrency_cancel_in_progress?: boolean;
  concurrency_group?: string | null;
  created_at: string;
  created_by: string;
  current_job?: string | null;
  current_job_id?: string | null;
  current_step: string | null;
  current_step_index: number | null;
  execution_context?: Record<string, unknown>;
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

type GitForgeWorkflowRunJobStatus =
  | "cancelled"
  | "failed"
  | "queued"
  | "running"
  | "skipped"
  | "success";

type GitForgeWorkflowRunJob = {
  current_step: string | null;
  current_step_index: number | null;
  finished_at: string | null;
  id: string;
  index: number;
  job_id: string;
  matrix?: Record<string, boolean | number | string>;
  name: string;
  needs?: string[];
  run_id: string;
  runner?: GitForgeWorkflowRunner | null;
  runs_on: string[];
  started_at: string | null;
  status: GitForgeWorkflowRunJobStatus;
  summary: string;
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
  job_run_id?: string | null;
  kind: "shell" | "uses";
  metadata?: Record<string, unknown>;
  name: string;
  output_preview: string;
  run_id: string;
  started_at: string | null;
  status: GitForgeWorkflowRunStepStatus;
  uses?: string | null;
};

type GitForgeWorkflowRunArtifact = {
  created_at: string;
  file_count: number;
  id: string;
  job_run_id: string;
  name: string;
  path: string;
  repository_id: string;
  run_id: string;
  size: number;
  step_id?: string | null;
};

type GitForgeWorkflowRunEventType =
  | "artifact.downloaded"
  | "artifact.uploaded"
  | "job.finished"
  | "job.heartbeat"
  | "job.output"
  | "job.started"
  | "release_asset.published"
  | "run.accepted"
  | "run.cancelled"
  | "run.cancellation_requested"
  | "run.failed"
  | "run.finished"
  | "run.status"
  | "step.finished"
  | "step.heartbeat"
  | "step.output"
  | "step.started";

type GitForgeWorkflowRunEvent = {
  artifact_id?: string;
  artifact_name?: string;
  chunk?: string;
  command?: string;
  created_at: string;
  id: string;
  job_id?: string;
  job_name?: string;
  job_run_id?: string;
  metadata?: Record<string, unknown>;
  repository_id: string;
  run_id: string;
  sequence: number;
  status?: GitForgeWorkflowRunStatus | GitForgeWorkflowRunJobStatus | GitForgeWorkflowRunStepStatus;
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

type GitForgeWorkflowRunJobFilters = {
  jobId?: string;
  status?: GitForgeWorkflowRunJobStatus | GitForgeWorkflowRunJobStatus[];
};

type GitForgeWorkflowRunStepFilters = {
  jobRunId?: string;
  status?: GitForgeWorkflowRunStepStatus | GitForgeWorkflowRunStepStatus[];
};

type GitForgeWorkflowRunArtifactFilters = {
  jobRunId?: string;
  name?: string;
};

type GitForgeWorkflowRunEventFilters = {
  afterSequence?: number;
  limit?: number;
};

type GitForgeWorkflowExecutionContext = {
  actor?: Record<string, unknown>;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

type RunGitForgeWorkflowInput = {
  actor: GitForgeActor;
  branch?: string;
  commitHash?: string;
  env?: Record<string, string>;
  executionContext?: GitForgeWorkflowExecutionContext;
  inputs?: Record<string, boolean | string>;
  ref?: string;
  secrets?: Record<string, string>;
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

type GitForgeActionsExecutionContextResolver = (input: {
  actor: GitForgeActor;
  repositoryId: string;
  runInput: RunGitForgeWorkflowInput;
  triggerContext: Record<string, unknown>;
  triggerKind: GitForgeWorkflowTriggerKind;
  workflow: GitForgeWorkflow;
}) => MaybePromise<GitForgeWorkflowExecutionContext | null | undefined>;

export type {
  CancelGitForgeWorkflowRunInput,
  GitForgeActionsExecutionContextResolver,
  GitForgeRepositoryOverview,
  GitForgeWorkflowExecutionContext,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunner,
  GitForgeWorkflowRunArtifact,
  GitForgeWorkflowRunArtifactFilters,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunEventType,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunJobFilters,
  GitForgeWorkflowRunJobStatus,
  GitForgeWorkflowRunSocketSubscription,
  GitForgeWorkflowRunStatus,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepFilters,
  GitForgeWorkflowRunStepStatus,
  RunGitForgeWorkflowInput,
};
