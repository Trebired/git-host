import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

import { GitHostError } from "#8974ac53d713";
import { runGit } from "#96b00569f1f4";
import type { GitForgeLocalRunnerChildSpec, GitForgeLocalRunnerOptions } from "#1mbdfxwwqqpa";

type RunShellCommandInput = {
  beforeSpawn?: GitForgeLocalRunnerOptions["beforeSpawn"];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  execTimeoutMs?: number;
  gid?: number;
  heartbeatIntervalMs: number;
  onHeartbeat: () => void | Promise<void>;
  onOutput: (stream: "stderr" | "stdout", chunk: string) => void | Promise<void>;
  onSpawn?: (child: ChildProcess | null) => void;
  shell: string;
  uid?: number;
};

type RunShellCommandResult = {
  exitCode: number;
  outputPreview: string;
};

const OUTPUT_PREVIEW_LIMIT = 4000;
// Grace period between the SIGTERM and the follow-up SIGKILL for timed-out steps.
const TIMEOUT_SIGKILL_GRACE_MS = 5000;

function appendPreview(current: string, chunk: string) {
  const next = `${current}${chunk}`;
  return next.length <= OUTPUT_PREVIEW_LIMIT ? next : next.slice(-OUTPUT_PREVIEW_LIMIT);
}

// Builds the concrete process to spawn for a step and lets callers wrap it (for
// example with a sandbox such as bwrap/nsjail) via the `beforeSpawn` hook.
async function resolveChildSpec(input: RunShellCommandInput): Promise<GitForgeLocalRunnerChildSpec> {
  const base: GitForgeLocalRunnerChildSpec = {
    args: ["-lc", input.command],
    command: input.shell,
    cwd: input.cwd,
    env: input.env as Record<string, string>,
    ...(input.gid === undefined ? {} : { gid: input.gid }),
    ...(input.uid === undefined ? {} : { uid: input.uid }),
  };
  const next = input.beforeSpawn ? await input.beforeSpawn(base) : undefined;
  return next || base;
}

function spawnChildSpec(spec: GitForgeLocalRunnerChildSpec) {
  const options: SpawnOptions = {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...(spec.gid === undefined ? {} : { gid: spec.gid }),
    ...(spec.uid === undefined ? {} : { uid: spec.uid }),
  };
  return spawn(spec.command, spec.args, options);
}

// Escalates a per-step wall-clock timeout from SIGTERM to SIGKILL. Returns a
// disposer that cancels the pending signals once the child settles.
function attachExecTimeout(child: ChildProcess, execTimeoutMs: number | undefined) {
  if (!execTimeoutMs || execTimeoutMs <= 0) return () => {};
  const term = setTimeout(() => child.kill("SIGTERM"), execTimeoutMs);
  const kill = setTimeout(() => child.kill("SIGKILL"), execTimeoutMs + TIMEOUT_SIGKILL_GRACE_MS);
  term.unref?.();
  kill.unref?.();
  return () => {
    clearTimeout(term);
    clearTimeout(kill);
  };
}

function wireChildOutput(child: ChildProcess, input: RunShellCommandInput, preview: { value: string }) {
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    preview.value = appendPreview(preview.value, chunk);
    void input.onOutput("stdout", chunk);
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    preview.value = appendPreview(preview.value, chunk);
    void input.onOutput("stderr", chunk);
  });
}

async function materializeJobWorkspace(input: {
  commitHash: string;
  repositoryPath: string;
  workspacePath: string;
}) {
  fs.rmSync(input.workspacePath, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(input.workspacePath), { recursive: true });
  const clone = await runGit(["clone", "--quiet", "--no-checkout", input.repositoryPath, input.workspacePath], {
    cwd: path.dirname(input.workspacePath),
  });
  if (!clone.ok) {
    throw new GitHostError("forge_actions_runner_failed", "Failed to clone repository snapshot for workflow job.", {
      repositoryPath: input.repositoryPath,
      stderr: clone.stderr,
      stdout: clone.stdout,
      workspacePath: input.workspacePath,
    });
  }
  const checkout = await runGit(["checkout", "--detach", input.commitHash], {
    cwd: input.workspacePath,
  });
  if (!checkout.ok) {
    throw new GitHostError("forge_actions_runner_failed", "Failed to checkout workflow job snapshot.", {
      commitHash: input.commitHash,
      repositoryPath: input.repositoryPath,
      stderr: checkout.stderr,
      stdout: checkout.stdout,
      workspacePath: input.workspacePath,
    });
  }
}

function resolveExitCode(code: number | null, signal: NodeJS.Signals | null) {
  if (typeof code === "number") return code;
  if (signal === "SIGKILL") return 137;
  if (signal === "SIGTERM" || signal === "SIGINT") return 130;
  return 1;
}

async function runShellCommand(input: RunShellCommandInput): Promise<RunShellCommandResult> {
  const preview = { value: "" };
  const spec = await resolveChildSpec(input);
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawnChildSpec(spec);
    input.onSpawn?.(child);
    const heartbeat = setInterval(() => {
      void input.onHeartbeat();
    }, Math.max(250, input.heartbeatIntervalMs));
    const disposeTimeout = attachExecTimeout(child, input.execTimeoutMs);
    wireChildOutput(child, input, preview);
    child.on("error", (error) => {
      clearInterval(heartbeat);
      disposeTimeout();
      input.onSpawn?.(null);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      disposeTimeout();
      input.onSpawn?.(null);
      resolve(resolveExitCode(code, signal));
    });
  });
  return {
    exitCode,
    outputPreview: preview.value,
  };
}

async function assertBinaryAvailable(command: string, cwd: string) {
  const res = await runGit(["--version"], { cwd });
  void res;
  const shell = spawn("bash", ["-lc", `command -v ${command}`], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const code = await new Promise<number>((resolve) => {
    shell.on("close", (status) => resolve(typeof status === "number" ? status : 1));
  });
  if (code !== 0) {
    throw new GitHostError("forge_actions_runner_failed", `Required runtime "${command}" is not available on the local runner.`, {
      command,
    });
  }
}

async function readCommandOutput(command: string, cwd: string) {
  const child = spawn("bash", ["-lc", command], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number>((resolve) => {
    child.on("close", (status) => resolve(typeof status === "number" ? status : 1));
  });
  return {
    exitCode,
    stderr,
    stdout,
  };
}

async function setupRuntime(command: "bun" | "node", cwd: string) {
  await assertBinaryAvailable(command, cwd);
  return await readCommandOutput(`${command} --version`, cwd);
}

export {
  materializeJobWorkspace,
  runShellCommand,
  setupRuntime,
};
