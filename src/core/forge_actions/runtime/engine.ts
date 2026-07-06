import { createJobExecutor } from "./job/execute.js";
import { createQueueSupport } from "./queue.js";
import { createRuntimeApi } from "./api.js";
import { createRunExecutor } from "./run/execute.js";
import type {
  CancelWorkflowRun,
  RuntimeContext,
} from "./types.js";

function createRuntimeEngine(context: RuntimeContext) {
  const executeJob = createJobExecutor(context);
  const { processQueue } = createRunExecutor(context, executeJob);
  const cancelWorkflowRunRef = {
    current: null as CancelWorkflowRun | null,
  };
  const scheduleQueueProcessing = () => {
    if (context.processingRef.value) return;
    queueMicrotask(() => {
      void processQueue();
    });
  };
  const queueWorkflowRun = createQueueSupport({
    cancelWorkflowRunRef,
    context,
    scheduleQueueProcessing,
  });
  const runtime = createRuntimeApi(context, queueWorkflowRun);
  cancelWorkflowRunRef.current = runtime.cancelWorkflowRun;
  return runtime;
}

export { createRuntimeEngine };
