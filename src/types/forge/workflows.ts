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

type GitForgeWorkflowSchema = "gha-subset-v1" | "legacy-shell-v1";

type GitForgeWorkflowDispatchInputType = "boolean" | "string";

type GitForgeWorkflowDispatchInput = {
  default?: boolean | string;
  description?: string;
  name: string;
  required?: boolean;
  type: GitForgeWorkflowDispatchInputType;
};

type GitForgeWorkflowDispatchTrigger = {
  inputs?: GitForgeWorkflowDispatchInput[];
};

type GitForgeWorkflowPushTrigger = {
  branches?: string[];
  tags?: string[];
};

type GitForgeWorkflowTriggers = {
  push?: GitForgeWorkflowPushTrigger;
  workflow_dispatch?: GitForgeWorkflowDispatchTrigger;
};

type GitForgeWorkflowPermissions = Record<string, string>;

type GitForgeWorkflowConcurrency = {
  cancel_in_progress?: boolean;
  group: string;
};

type GitForgeWorkflowStep = {
  env?: Record<string, string>;
  id?: string;
  kind?: "shell";
  name: string;
  run: string;
  shell?: string;
};

type GitForgeWorkflowJobStep = {
  env?: Record<string, string>;
  id?: string;
  if?: string;
  kind?: "shell" | "uses";
  name?: string;
  run?: string;
  shell?: string;
  uses?: string;
  with?: Record<string, boolean | number | string>;
};

type GitForgeWorkflowJobMatrix = {
  include?: Array<Record<string, boolean | number | string>>;
  values: Record<string, Array<boolean | number | string>>;
};

type GitForgeWorkflowJobStrategy = {
  matrix?: GitForgeWorkflowJobMatrix;
};

type GitForgeWorkflowJob = {
  env?: Record<string, string>;
  id: string;
  if?: string;
  name: string;
  needs?: string[];
  runs_on: string[];
  steps: GitForgeWorkflowJobStep[];
  strategy?: GitForgeWorkflowJobStrategy;
};

type GitForgeWorkflowSource = {
  branches?: string[];
  env?: Record<string, string>;
  tags?: string[];
};

type GitForgeWorkflow = {
  concurrency?: GitForgeWorkflowConcurrency;
  definition_path: string;
  enabled: boolean;
  env?: Record<string, string>;
  id: string;
  jobs: GitForgeWorkflowJob[];
  name: string;
  on?: GitForgeWorkflowTriggers;
  origin: "file";
  permissions?: GitForgeWorkflowPermissions;
  repository_id: string;
  schema: GitForgeWorkflowSchema;
  slug: string;
  source?: GitForgeWorkflowSource;
  steps: GitForgeWorkflowStep[];
  supported_uses: string[];
  trigger: GitForgeWorkflowTriggerKind;
};

type CreateGitForgeWorkflowInput = {
  actor: GitForgeActor;
  enabled?: boolean;
  env?: Record<string, string>;
  jobs?: GitForgeWorkflowJob[];
  name: string;
  on?: GitForgeWorkflowTriggers;
  permissions?: GitForgeWorkflowPermissions;
  slug?: string;
  source?: GitForgeWorkflowSource;
  steps?: GitForgeWorkflowStep[];
  trigger?: GitForgeWorkflowTriggerKind;
};

type UpdateGitForgeWorkflowInput = {
  actor: GitForgeActor;
  enabled?: boolean;
  env?: Record<string, string>;
  jobs?: GitForgeWorkflowJob[];
  name?: string;
  on?: GitForgeWorkflowTriggers;
  permissions?: GitForgeWorkflowPermissions;
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

type GitForgeActionsStorage = {
  appendWorkflowRunEvent(input: GitForgeWorkflowRunEvent): MaybePromise<GitForgeWorkflowRunEvent>;
  createWorkflowRun(input: GitForgeWorkflowRun): MaybePromise<GitForgeWorkflowRun>;
  createWorkflowRunArtifact(input: GitForgeWorkflowRunArtifact): MaybePromise<GitForgeWorkflowRunArtifact>;
  createWorkflowRunJob(input: GitForgeWorkflowRunJob): MaybePromise<GitForgeWorkflowRunJob>;
  createWorkflowRunStep(input: GitForgeWorkflowRunStep): MaybePromise<GitForgeWorkflowRunStep>;
  listWorkflowRunArtifacts(runId: string, filters?: GitForgeWorkflowRunArtifactFilters): MaybePromise<GitForgeWorkflowRunArtifact[]>;
  listWorkflowRunEvents(runId: string, filters?: GitForgeWorkflowRunEventFilters): MaybePromise<GitForgeWorkflowRunEvent[]>;
  listWorkflowRunJobs(runId: string, filters?: GitForgeWorkflowRunJobFilters): MaybePromise<GitForgeWorkflowRunJob[]>;
  listWorkflowRunSteps(runId: string, filters?: GitForgeWorkflowRunStepFilters): MaybePromise<GitForgeWorkflowRunStep[]>;
  listWorkflowRuns(repositoryId: string, filters?: GitForgeWorkflowRunFilters): MaybePromise<GitForgeWorkflowRun[]>;
  readWorkflowRun(repositoryId: string, runId: string): MaybePromise<GitForgeWorkflowRun | null>;
  readWorkflowRunArtifact(runId: string, artifactId: string): MaybePromise<GitForgeWorkflowRunArtifact | null>;
  readWorkflowRunJob(runId: string, jobRunId: string): MaybePromise<GitForgeWorkflowRunJob | null>;
  updateWorkflowRun(
    repositoryId: string,
    runId: string,
    input: Partial<Omit<GitForgeWorkflowRun, "created_at" | "created_by" | "id" | "repository_id" | "workflow_id">>,
  ): MaybePromise<GitForgeWorkflowRun | null>;
  updateWorkflowRunJob(
    runId: string,
    jobRunId: string,
    input: Partial<Omit<GitForgeWorkflowRunJob, "id" | "index" | "job_id" | "name" | "run_id" | "runs_on">>,
  ): MaybePromise<GitForgeWorkflowRunJob | null>;
  updateWorkflowRunStep(
    runId: string,
    stepId: string,
    input: Partial<Omit<GitForgeWorkflowRunStep, "command" | "id" | "index" | "kind" | "name" | "run_id">>,
  ): MaybePromise<GitForgeWorkflowRunStep | null>;
};

type GitForgeActionsEnvironmentOptions = {
  baseEnv?: Record<string, string>;
  inheritProcessEnv?: boolean;
  passthrough?: string[];
  sensitiveKeys?: string[];
};

type GitForgeLocalRunnerChildSpec = {
  args: string[];
  command: string;
  cwd?: string;
  env: Record<string, string>;
  gid?: number;
  uid?: number;
};

type GitForgeLocalRunnerOptions = {
  beforeSpawn?: (child: GitForgeLocalRunnerChildSpec) => MaybePromise<GitForgeLocalRunnerChildSpec | void>;
  execTimeoutMs?: number;
  gid?: number;
  uid?: number;
};

type CreateGitForgeActionsOptions = {
  env?: Record<string, string>;
  environment?: GitForgeActionsEnvironmentOptions;
  heartbeatIntervalMs?: number;
  localRunner?: GitForgeLocalRunnerOptions;
  localRunnerLabels?: string[];
  redactOutput?: (input: {
    chunk: string;
    run: GitForgeWorkflowRun;
    step: GitForgeWorkflowRunStep;
    stream: "stderr" | "stdout";
  }) => MaybePromise<string>;
  resolveExecutionContext?: GitForgeActionsExecutionContextResolver;
  runner?: Partial<GitForgeWorkflowRunner>;
  runnerBinaryPath?: string;
  resolveWorkflowRoot?: (repositoryId: string) => MaybePromise<string | null | undefined>;
  releaseAssetsRoot?: string;
  shell?: string;
  workflowRoot?: string;
  workspaceRoot?: string;
};

export type {
  CancelGitForgeWorkflowRunInput,
  CreateGitForgeActionsOptions,
  CreateGitForgeWorkflowInput,
  GitForgeActionsEnvironmentOptions,
  GitForgeActionsExecutionContextResolver,
  GitForgeActionsStorage,
  GitForgeLocalRunnerChildSpec,
  GitForgeLocalRunnerOptions,
  GitForgeRepositoryOverview,
  GitForgeWorkflow,
  GitForgeWorkflowConcurrency,
  GitForgeWorkflowDispatchInput,
  GitForgeWorkflowDispatchInputType,
  GitForgeWorkflowDispatchTrigger,
  GitForgeWorkflowExecutionContext,
  GitForgeWorkflowFilters,
  GitForgeWorkflowJob,
  GitForgeWorkflowJobMatrix,
  GitForgeWorkflowJobStep,
  GitForgeWorkflowJobStrategy,
  GitForgeWorkflowPermissions,
  GitForgeWorkflowPushTrigger,
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
  GitForgeWorkflowSchema,
  GitForgeWorkflowSource,
  GitForgeWorkflowStep,
  GitForgeWorkflowTriggers,
  GitForgeWorkflowTriggerKind,
  RunGitForgeWorkflowInput,
  UpdateGitForgeWorkflowInput,
};
