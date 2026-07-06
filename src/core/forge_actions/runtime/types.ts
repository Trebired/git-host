import type {
  GitForgeActionsStorage,
  GitForgeActor,
  GitForgeWorkflow,
  GitForgeWorkflowRun,
  GitForgeWorkflowTriggerKind,
  RunGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";

import type { createJobStepSupport } from "#rlvv6s65veqm";
import type {
  ActiveRunState,
  CreateGitForgeActionsRuntimeOptions,
  ResolvedExecutionContext,
  WorkflowQueueItem,
  WorkflowRunListener,
} from "#gc1rzxkbhrqu";
import type { createRuntimeSupport } from "#gzjgum0vj7q8";

type CancelWorkflowRun = (
  repositoryId: string,
  runId: string,
  actor: GitForgeActor,
) => Promise<GitForgeWorkflowRun>;

type QueueWorkflowRun = (
  repositoryId: string,
  workflow: GitForgeWorkflow,
  input: RunGitForgeWorkflowInput & {
    triggerKind: GitForgeWorkflowTriggerKind;
  },
) => Promise<GitForgeWorkflowRun>;

type RuntimeContext = {
  activeRuns: Map<string, ActiveRunState>;
  jobStepSupport: ReturnType<typeof createJobStepSupport>;
  options: CreateGitForgeActionsRuntimeOptions;
  processingRef: {
    value: boolean;
  };
  queuedRuns: WorkflowQueueItem[];
  runExecutionContexts: Map<string, ResolvedExecutionContext>;
  runListeners: Map<string, Set<WorkflowRunListener>>;
  runner: ReturnType<typeof import("#gc1rzxkbhrqu").normalizeRunner>;
  runtimeSupport: ReturnType<typeof createRuntimeSupport>;
  storage: GitForgeActionsStorage;
};

export type {
  CancelWorkflowRun,
  QueueWorkflowRun,
  RuntimeContext,
};
