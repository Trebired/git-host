import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { GitHostError } from "#8974ac53d713";
import { runGit } from "#96b00569f1f4";
import { text } from "#62f869522d1f";

type RunShellCommandInput = {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  heartbeatIntervalMs: number;
  onHeartbeat: () => void | Promise<void>;
  onOutput: (stream: "stderr" | "stdout", chunk: string) => void | Promise<void>;
  onSpawn?: (child: ChildProcess | null) => void;
  shell: string;
};

type RunShellCommandResult = {
  exitCode: number;
  outputPreview: string;
};

const OUTPUT_PREVIEW_LIMIT = 4000;

function appendPreview(current: string, chunk: string) {
  const next = `${current}${chunk}`;
  return next.length <= OUTPUT_PREVIEW_LIMIT ? next : next.slice(-OUTPUT_PREVIEW_LIMIT);
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

async function runShellCommand(input: RunShellCommandInput): Promise<RunShellCommandResult> {
  let outputPreview = "";
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(input.shell, ["-lc", input.command], {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    input.onSpawn?.(child);
    const heartbeat = setInterval(() => {
      void input.onHeartbeat();
    }, Math.max(250, input.heartbeatIntervalMs));
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      outputPreview = appendPreview(outputPreview, chunk);
      void input.onOutput("stdout", chunk);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      outputPreview = appendPreview(outputPreview, chunk);
      void input.onOutput("stderr", chunk);
    });
    child.on("error", (error) => {
      clearInterval(heartbeat);
      input.onSpawn?.(null);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      input.onSpawn?.(null);
      resolve(typeof code === "number" ? code : (signal === "SIGTERM" || signal === "SIGINT" ? 130 : 1));
    });
  });
  return {
    exitCode,
    outputPreview,
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
