import { spawn, type ChildProcess } from "node:child_process";

import { text } from "#62f869522d1f";

import { buildStepBaseEnv } from "./environment.js";
import { appendPreview, normalizeRunnerInput } from "./runner/protocol.js";
import type {
  ActionsRunnerExecution,
  ActionsRunnerHandle,
  ExecuteActionsRunnerInput,
  RunnerStepState,
} from "./types.js";
import { materializeWorkspace } from "./workspace.js";

function createRunnerState(): RunnerStepState {
  return {
    lastStepIndex: -1,
    lastStepName: "",
  };
}

function buildStepEnv(
  input: ExecuteActionsRunnerInput,
  step: ReturnType<typeof normalizeRunnerInput>["steps"][number],
) {
  return {
    ...buildStepBaseEnv(input.actions?.environment),
    ...(input.actions?.env || {}),
    ...(step.env || {}),
  };
}

function resolveStepShell(input: ExecuteActionsRunnerInput, step: ReturnType<typeof normalizeRunnerInput>["steps"][number]) {
  return text(step.shell, text(input.actions?.shell, "bash")) || "bash";
}

function createRunnerHandle(getChild: () => ChildProcess | null): {
  cancelled: () => boolean;
  handle: ActionsRunnerHandle;
} {
  let cancelled = false;
  let killed = false;

  return {
    cancelled: () => cancelled,
    handle: {
      get killed() {
        return killed;
      },
      kill(signal?: NodeJS.Signals | number) {
        killed = true;
        cancelled = signal === "SIGTERM" || signal === "SIGINT" || Number(signal) === 15 || Number(signal) === 2;
        try {
          return getChild()?.kill(typeof signal === "number" ? undefined : signal) ?? true;
        } catch {}
        return false;
      },
    },
  };
}

function emitNodeStepStarted(
  input: ExecuteActionsRunnerInput,
  step: ReturnType<typeof normalizeRunnerInput>["steps"][number],
) {
  return input.onEvent({
    command: step.command,
    step_id: step.id,
    step_index: step.index,
    step_name: step.name,
    type: "step.started",
  });
}

function emitNodeStepOutput(
  input: ExecuteActionsRunnerInput,
  step: ReturnType<typeof normalizeRunnerInput>["steps"][number],
  stream: "stderr" | "stdout",
  chunk: string,
) {
  return input.onEvent({
    chunk,
    step_id: step.id,
    step_index: step.index,
    step_name: step.name,
    stream,
    type: "step.output",
  });
}

function createNodeStepHeartbeat(
  input: ExecuteActionsRunnerInput,
  heartbeatIntervalMs: number,
  step: ReturnType<typeof normalizeRunnerInput>["steps"][number],
) {
  return setInterval(() => {
    void input.onEvent({
      step_id: step.id,
      step_index: step.index,
      step_name: step.name,
      type: "step.heartbeat",
    });
  }, Math.max(250, heartbeatIntervalMs));
}

function resolveNodeStepExitCode(code: number | null, signal: NodeJS.Signals | null, isCancelled: () => boolean) {
  return typeof code === "number"
    ? code
    : (signal === "SIGTERM" || signal === "SIGINT" || isCancelled() ? 130 : 1);
}

async function emitNodeStepFinished(
  input: ExecuteActionsRunnerInput,
  step: ReturnType<typeof normalizeRunnerInput>["steps"][number],
  exitCode: number,
  outputPreview: string,
  isCancelled: () => boolean,
) {
  const cancelled = isCancelled();
  await input.onEvent({
    exit_code: exitCode,
    output_preview: outputPreview,
    status: cancelled ? "cancelled" : (exitCode === 0 ? "success" : "failed"),
    step_id: step.id,
    step_index: step.index,
    step_name: step.name,
    summary: cancelled
      ? `Cancelled during step ${step.name}.`
      : (exitCode === 0 ? `Completed step ${step.name}.` : `Failed step ${step.name}.`),
    type: "step.finished",
  });
}

function spawnNodeStep(
  input: ExecuteActionsRunnerInput,
  heartbeatIntervalMs: number,
  workspaceDirectory: string,
  setChild: (child: ChildProcess | null) => void,
  isCancelled: () => boolean,
  step: ReturnType<typeof normalizeRunnerInput>["steps"][number],
) {
  const shell = resolveStepShell(input, step);
  const env = buildStepEnv(input, step);
  let outputPreview = "";

  const exitCode = new Promise<number>((resolve, reject) => {
    const child = spawn(shell, ["-lc", step.command], {
      cwd: workspaceDirectory,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    setChild(child);
    const heartbeat = createNodeStepHeartbeat(input, heartbeatIntervalMs, step);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      outputPreview = appendPreview(outputPreview, chunk);
      void emitNodeStepOutput(input, step, "stdout", chunk);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      outputPreview = appendPreview(outputPreview, chunk);
      void emitNodeStepOutput(input, step, "stderr", chunk);
    });
    child.on("error", (error) => {
      clearInterval(heartbeat);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      setChild(null);
      resolve(resolveNodeStepExitCode(code, signal, isCancelled));
    });
  });

  return {
    exitCode,
    readOutputPreview: () => outputPreview,
  };
}

async function runNodeStep(
  input: ExecuteActionsRunnerInput,
  heartbeatIntervalMs: number,
  workspaceDirectory: string,
  state: RunnerStepState,
  setChild: (child: ChildProcess | null) => void,
  isCancelled: () => boolean,
  step: ReturnType<typeof normalizeRunnerInput>["steps"][number],
) {
  state.lastStepIndex = step.index;
  state.lastStepName = step.name;

  await emitNodeStepStarted(input, step);
  const running = spawnNodeStep(input, heartbeatIntervalMs, workspaceDirectory, setChild, isCancelled, step);
  const exitCode = await running.exitCode;
  await emitNodeStepFinished(input, step, exitCode, running.readOutputPreview(), isCancelled);
  return exitCode;
}

function executeNodeRunner(input: ExecuteActionsRunnerInput): ActionsRunnerExecution {
  const runnerInput = normalizeRunnerInput(input);
  const state = createRunnerState();
  let currentChild: ChildProcess | null = null;
  const { cancelled: isCancelled, handle } = createRunnerHandle(() => currentChild);

  const completed = (async () => {
    const workspaceDirectory = await materializeWorkspace(runnerInput);
    await input.onEvent({
      status: "running",
      summary: "Running workflow steps.",
      type: "run.status",
    });

    for (const step of runnerInput.steps) {
      const exitCode = await runNodeStep(
        input,
        runnerInput.heartbeat_interval_ms,
        workspaceDirectory,
        state,
        (child) => {
          currentChild = child;
        },
        isCancelled,
        step,
      );
      if (isCancelled() || exitCode !== 0) {
        return {
          cancelled: isCancelled(),
          exitCode,
          lastStepIndex: state.lastStepIndex,
          lastStepName: state.lastStepName,
        };
      }
    }

    return {
      cancelled: false,
      exitCode: 0,
      lastStepIndex: state.lastStepIndex,
      lastStepName: state.lastStepName,
    };
  })();

  return {
    child: handle,
    completed,
  };
}

export { executeNodeRunner };
