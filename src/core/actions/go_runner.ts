import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import { GitHostError } from "#8974ac53d713";

import { normalizeRunnerInput, parseRunnerEvent, updateLastStep } from "./runner/protocol.js";
import type { ActionsRunnerExecution, ExecuteActionsRunnerInput, RunnerLaunch, RunnerStepState } from "./types.js";

function createRunnerState(): RunnerStepState {
  return {
    lastStepIndex: -1,
    lastStepName: "",
  };
}

function flushBufferedLine(
  input: ExecuteActionsRunnerInput,
  line: string,
  state: RunnerStepState,
) {
  const event = parseRunnerEvent(line);
  updateLastStep(event, state);
  return input.onEvent(event);
}

function createGoRunnerChild(
  input: ExecuteActionsRunnerInput,
  launch: Extract<RunnerLaunch, { kind: "go" }>,
) {
  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.write(JSON.stringify(normalizeRunnerInput(input)));
  child.stdin.end();
  return child;
}

function bindGoRunnerStdout(
  child: ChildProcess,
  input: ExecuteActionsRunnerInput,
  state: RunnerStepState,
) {
  let stdoutBuffer = "";
  let queue = Promise.resolve();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer = `${stdoutBuffer}${chunk}`.replace(/\r\n/g, "\n");
    let separator = stdoutBuffer.indexOf("\n");
    while (separator >= 0) {
      const line = stdoutBuffer.slice(0, separator).trim();
      stdoutBuffer = stdoutBuffer.slice(separator + 1);
      if (line) {
        queue = queue.then(() => flushBufferedLine(input, line, state));
      }
      separator = stdoutBuffer.indexOf("\n");
    }
  });

  return {
    flushRemainder() {
      const line = stdoutBuffer.trim();
      if (line) {
        queue = queue.then(() => flushBufferedLine(input, line, state));
      }
      return queue;
    },
  };
}

function bindGoRunnerStderr(child: ChildProcess, input: ExecuteActionsRunnerInput) {
  const stderrChunks: string[] = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrChunks.push(chunk);
    void input.onRunnerError?.(chunk);
  });
  return stderrChunks;
}

function resolveGoRunnerFailure(exitCode: number, cancelled: boolean, stderrChunks: string[]) {
  if (exitCode === 0 || cancelled || stderrChunks.length === 0) {
    return null;
  }
  const message = stderrChunks.join("").trim();
  return message
    ? new GitHostError("forge_actions_runner_failed", message, {
        exitCode,
      })
    : null;
}

function executeGoRunner(
  input: ExecuteActionsRunnerInput,
  launch: Extract<RunnerLaunch, { kind: "go" }>,
): ActionsRunnerExecution {
  const child = createGoRunnerChild(input, launch);
  const state = createRunnerState();
  const stdout = bindGoRunnerStdout(child, input, state);
  const stderrChunks = bindGoRunnerStderr(child, input);

  const completed = new Promise<{
    cancelled: boolean;
    exitCode: number;
    lastStepIndex: number;
    lastStepName: string;
  }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", async (code, signal) => {
      try {
        await stdout.flushRemainder();
      } catch (error) {
        reject(error);
        return;
      }

      const exitCode = Number(code) || 0;
      const cancelled = signal === "SIGTERM" || signal === "SIGINT" || exitCode === 130;
      const failure = resolveGoRunnerFailure(exitCode, cancelled, stderrChunks);
      if (failure) {
        reject(failure);
        return;
      }

      resolve({
        cancelled,
        exitCode,
        lastStepIndex: state.lastStepIndex,
        lastStepName: state.lastStepName,
      });
    });
  });

  return {
    child,
    completed,
  };
}

export { executeGoRunner };
