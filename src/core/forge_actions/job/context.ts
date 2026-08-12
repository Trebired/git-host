import type {
  GitForgeActionsStorage,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunJob,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepStatus,
} from "#14021226ec9b";

type JobStepSupportContext = {
  emitRunEvent: (
    run: GitForgeWorkflowRun,
    input: Omit<
    GitForgeWorkflowRunEvent,
    |"created_at"
    |"id"
    |"repository_id"
    |"run_id"
    |"sequence"
    |"workflow_id"
    >,
  ) => Promise<GitForgeWorkflowRun["id"]extends string?any:never>;
  markQueuedStepsForJob: (
    runId: string,
    jobRunId: string,
    status: Extract<GitForgeWorkflowRunStepStatus, "cancelled"|"skipped">,
  ) => Promise<void>;
  options: import("#gc1rzxkbhrqu").CreateGitForgeActionsRuntimeOptions;
  runner: ReturnType<typeof import("#gc1rzxkbhrqu").normalizeRunner>;
  storage: GitForgeActionsStorage;
  updateJob: (
    runId: string,
    jobRunId: string,
    input: Parameters<GitForgeActionsStorage["updateWorkflowRunJob"]>[2],
  ) => Promise<GitForgeWorkflowRunJob>;
  updateStep: (
    runId: string,
    stepId: string,
    input: Parameters<GitForgeActionsStorage["updateWorkflowRunStep"]>[2],
  ) => Promise<GitForgeWorkflowRunStep>;
};

export type { JobStepSupportContext };
