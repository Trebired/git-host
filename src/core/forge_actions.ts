import { createJobStepSupport } from "./forge_actions/job/steps.js";
import { createRuntimeEngine } from "./forge_actions/runtime/engine.js";
import { createRuntimeSupport } from "./forge_actions/runtime_support.js";
import {
  ensureActionsStorage,
  isTerminalRunStatus,
  normalizeRunner,
  warnForUnsafeRunnerOptions,
} from "./forge_actions/shared.js";
import type {
  ActiveRunState,
  CreateGitForgeActionsRuntimeOptions,
  ResolvedExecutionContext,
  WorkflowQueueItem,
  WorkflowRunListener,
} from "./forge_actions/shared.js";

function createGitForgeActionsRuntime(options: CreateGitForgeActionsRuntimeOptions) {
  const storage = ensureActionsStorage(options.storage);
  const runListeners = new Map<string, Set<WorkflowRunListener>>();
  const runSequences = new Map<string, number>();
  const runExecutionContexts = new Map<string, ResolvedExecutionContext>();
  const queuedRuns: WorkflowQueueItem[] = [];
  const activeRuns = new Map<string, ActiveRunState>();
  const runner = normalizeRunner(options.actions);

  warnForUnsafeRunnerOptions(options.actions, runner);
  const runtimeSupport = createRuntimeSupport({
    options,
    runListeners,
    runSequences,
    runner,
    storage,
  });
  const jobStepSupport = createJobStepSupport({
    emitRunEvent: runtimeSupport.emitRunEvent,
    markQueuedStepsForJob: runtimeSupport.markQueuedStepsForJob,
    options,
    runner,
    storage,
    updateJob: runtimeSupport.updateJob,
    updateStep: runtimeSupport.updateStep,
  });

  return createRuntimeEngine({
    activeRuns,
    jobStepSupport,
    options,
    processingRef: { value: false },
    queuedRuns,
    runExecutionContexts,
    runListeners,
    runner,
    runtimeSupport,
    storage,
  });
}

export { createGitForgeActionsRuntime, isTerminalRunStatus };
