import type { MaybePromise } from "#5a0e75b6bdb8";

import type {
  GitForgeWorkflow,
  GitForgeWorkflowTriggerKind,
} from "./definition.js";
import type {
  GitForgeActionsExecutionContextResolver,
  GitForgeWorkflowExecutionContext,
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
  GitForgeWorkflowRunner,
  RunGitForgeWorkflowInput,
} from "./runs.js";

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

type GitForgeBubblewrapSandboxOptions = {
  allowNetwork?: boolean;
  bind?: string[];
  bwrapPath?: string;
  roBind?: string[];
  systemPaths?: string[];
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

type GitForgeWorkflowExecutionResolverInput = {
  actor: Parameters<GitForgeActionsExecutionContextResolver>[0]["actor"];
  repositoryId: string;
  runInput: RunGitForgeWorkflowInput;
  triggerContext: Record<string, unknown>;
  triggerKind: GitForgeWorkflowTriggerKind;
  workflow: GitForgeWorkflow;
};

void (0 as unknown as GitForgeWorkflowExecutionResolverInput | GitForgeWorkflowExecutionContext | null);

export type {
  CreateGitForgeActionsOptions,
  GitForgeActionsEnvironmentOptions,
  GitForgeActionsStorage,
  GitForgeBubblewrapSandboxOptions,
  GitForgeLocalRunnerChildSpec,
  GitForgeLocalRunnerOptions,
};
