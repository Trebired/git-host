import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeActionsOptions,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunStep,
} from "#1mbdfxwwqqpa";
import { runGit } from "./run_git.js";
import { text } from "../utils/text.js";

type ActionsRunnerInput = {
  branch: string;
  commit_hash: string;
  env?: Record<string, string>;
  heartbeat_interval_ms: number;
  ref: string;
  release_id: string;
  repository_id: string;
  repository_path: string;
  run_id: string;
  shell: string;
  steps: Array<{
    command: string;
    env?: Record<string, string>;
    id: string;
    index: number;
    name: string;
    shell?: string;
  }>;
  workflow_id: string;
  workspace_root: string;
};

type ActionsRunnerEvent =
  | {
      status: GitForgeWorkflowRun["status"];
      summary: string;
      type: "run.status";
    }
  | {
      command: string;
      step_id: string;
      step_index: number;
      step_name: string;
      type: "step.started";
    }
  | {
      chunk: string;
      step_id: string;
      step_index: number;
      step_name: string;
      stream: "stderr" | "stdout";
      type: "step.output";
    }
  | {
      step_id: string;
      step_index: number;
      step_name: string;
      type: "step.heartbeat";
    }
  | {
      exit_code: number;
      output_preview: string;
      status: GitForgeWorkflowRunStep["status"];
      step_id: string;
      step_index: number;
      step_name: string;
      summary: string;
      type: "step.finished";
    };

type ActionsRunnerHandle = Pick<ChildProcess, "kill" | "killed">;

type ActionsRunnerExecution = {
  child: ActionsRunnerHandle;
  completed: Promise<{
    cancelled: boolean;
    exitCode: number;
    lastStepIndex: number;
    lastStepName: string;
  }>;
};

type ExecuteActionsRunnerInput = {
  actions: CreateGitForgeActionsOptions | undefined;
  heartbeatIntervalMs: number;
  onEvent: (event: ActionsRunnerEvent) => Promise<void>;
  onRunnerError?: (chunk: string) => Promise<void>;
  repositoryPath: string;
  run: GitForgeWorkflowRun;
  steps: GitForgeWorkflowRunStep[];
  workspaceRoot: string;
};

type RunnerLaunch =
  | {
      args: string[];
      command: string;
      cwd?: string;
      kind: "go";
    }
  | {
      kind: "node";
    };

const RUNNER_BINARY_NAMES = {
  "darwin-arm64": "git-host-actions-runner-darwin-arm64",
  "darwin-x64": "git-host-actions-runner-darwin-x64",
  "linux-arm64": "git-host-actions-runner-linux-arm64-gnu",
  "linux-x64": "git-host-actions-runner-linux-x64-gnu",
} satisfies Record<string, string>;

function findPackageRoot(startPath: string): string {
  let current = path.resolve(startPath);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new GitHostError("forge_actions_runner_not_found", "Unable to resolve the package root for the actions runner.");
}

function packageRootIsSourceCheckout(packageRoot: string) {
  return fs.existsSync(path.join(packageRoot, ".git"));
}

function resolvePackagedRunnerPath(options: CreateGitForgeActionsOptions | undefined): string | null {
  const explicit = text(options?.runnerBinaryPath);
  if (explicit) return explicit;
  const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  if (packageRootIsSourceCheckout(packageRoot)) {
    return null;
  }
  const key = `${process.platform}-${process.arch}`;
  const binary = RUNNER_BINARY_NAMES[key as keyof typeof RUNNER_BINARY_NAMES];
  if (!binary) return null;
  const candidate = path.join(packageRoot, "bin", binary);
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveGoFallbackCommand(): { args: string[]; command: string; cwd: string } | null {
  const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  const sourcePath = path.join(packageRoot, "go", "cmd", "git-host-actions-runner");
  if (!fs.existsSync(sourcePath)) return null;
  const probe = spawnSync("go", ["version"], {
    encoding: "utf8",
  });
  if (probe.status !== 0) return null;
  return {
    args: ["run", "./go/cmd/git-host-actions-runner"],
    command: "go",
    cwd: packageRoot,
  };
}

function resolveRunnerLaunch(options: CreateGitForgeActionsOptions | undefined): RunnerLaunch {
  const packaged = resolvePackagedRunnerPath(options);
  if (packaged) {
    return {
      args: [],
      command: packaged,
      cwd: undefined,
      kind: "go",
    };
  }
  const goFallback = resolveGoFallbackCommand();
  if (goFallback) {
    return {
      ...goFallback,
      kind: "go",
    };
  }
  return {
    kind: "node",
  };
}

function normalizeRunnerInput(input: ExecuteActionsRunnerInput): ActionsRunnerInput {
  return {
    branch: text(input.run.branch),
    commit_hash: text(input.run.commit_hash),
    env: input.actions?.env,
    heartbeat_interval_ms: input.heartbeatIntervalMs,
    ref: text(input.run.ref, "HEAD"),
    release_id: text(input.run.release_id),
    repository_id: input.run.repository_id,
    repository_path: input.repositoryPath,
    run_id: input.run.id,
    shell: text(input.actions?.shell, "bash"),
    steps: input.steps.map((step) => ({
      command: step.command,
      env: step.metadata?.env && typeof step.metadata.env === "object"
        ? Object.fromEntries(Object.entries(step.metadata.env as Record<string, unknown>).map(([key, value]) => [text(key), text(value)] as const).filter(([key, value]) => key && value))
        : undefined,
      id: step.id,
      index: step.index,
      name: step.name,
      shell: text(step.metadata?.shell),
    })),
    workflow_id: input.run.workflow_id,
    workspace_root: input.workspaceRoot,
  };
}

function parseRunnerEvent(line: string): ActionsRunnerEvent {
  const parsed = JSON.parse(line) as ActionsRunnerEvent | GitForgeWorkflowRunEvent;
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new GitHostError("forge_actions_runner_protocol_error", "Actions runner emitted an invalid event payload.", {
      line,
    });
  }
  if (
    parsed.type !== "run.status"
    && parsed.type !== "step.started"
    && parsed.type !== "step.output"
    && parsed.type !== "step.heartbeat"
    && parsed.type !== "step.finished"
  ) {
    throw new GitHostError("forge_actions_runner_protocol_error", `Actions runner emitted unsupported event "${parsed.type}".`, {
      line,
    });
  }
  return parsed as ActionsRunnerEvent;
}

function updateLastStep(event: ActionsRunnerEvent, state: { lastStepIndex: number; lastStepName: string }) {
  if ("step_index" in event && typeof event.step_index === "number") {
    state.lastStepIndex = event.step_index;
  }
  if ("step_name" in event && typeof event.step_name === "string") {
    state.lastStepName = event.step_name;
  }
}

function appendPreview(current: string, chunk: string) {
  const next = `${current}${chunk}`;
  return next.length <= 4000 ? next : next.slice(-4000);
}

async function materializeWorkspace(input: ActionsRunnerInput) {
  const workspaceDirectory = path.join(input.workspace_root, "workspace");
  fs.rmSync(input.workspace_root, { force: true, recursive: true });
  fs.mkdirSync(input.workspace_root, { recursive: true });

  const clone = await runGit(["clone", "--quiet", "--no-checkout", input.repository_path, workspaceDirectory], {
    cwd: input.workspace_root,
  });
  if (!clone.ok) {
    throw new GitHostError("forge_actions_runner_failed", "Failed to clone repository snapshot for workflow run.", {
      repositoryPath: input.repository_path,
      stderr: clone.stderr,
      stdout: clone.stdout,
      workspaceDirectory,
    });
  }

  const checkout = await runGit(["checkout", "--detach", input.commit_hash], {
    cwd: workspaceDirectory,
  });
  if (!checkout.ok) {
    throw new GitHostError("forge_actions_runner_failed", "Failed to checkout workflow snapshot.", {
      commitHash: input.commit_hash,
      repositoryPath: input.repository_path,
      stderr: checkout.stderr,
      stdout: checkout.stdout,
      workspaceDirectory,
    });
  }

  return workspaceDirectory;
}

function executeGoRunner(input: ExecuteActionsRunnerInput, launch: Extract<RunnerLaunch, { kind: "go" }>): ActionsRunnerExecution {
  const runnerInput = normalizeRunnerInput(input);
  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const payload = JSON.stringify(runnerInput);
  child.stdin.write(payload);
  child.stdin.end();

  const stderrChunks: string[] = [];
  const state = {
    lastStepIndex: -1,
    lastStepName: "",
  };
  let stdoutBuffer = "";
  let cancelled = false;
  let queue = Promise.resolve();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    stdoutBuffer = stdoutBuffer.replace(/\r\n/g, "\n");
    let separator = stdoutBuffer.indexOf("\n");
    while (separator >= 0) {
      const line = stdoutBuffer.slice(0, separator).trim();
      stdoutBuffer = stdoutBuffer.slice(separator + 1);
      if (line) {
        queue = queue.then(async () => {
          const event = parseRunnerEvent(line);
          updateLastStep(event, state);
          await input.onEvent(event);
        });
      }
      separator = stdoutBuffer.indexOf("\n");
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrChunks.push(chunk);
    void input.onRunnerError?.(chunk);
  });

  const completed = new Promise<{
    cancelled: boolean;
    exitCode: number;
    lastStepIndex: number;
    lastStepName: string;
  }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", async (code, signal) => {
      cancelled = signal === "SIGTERM" || signal === "SIGINT" || Number(code) === 130;
      if (stdoutBuffer.trim()) {
        queue = queue.then(async () => {
          const event = parseRunnerEvent(stdoutBuffer.trim());
          updateLastStep(event, state);
          await input.onEvent(event);
        });
      }

      try {
        await queue;
      } catch (error) {
        reject(error);
        return;
      }

      if (Number(code) !== 0 && !cancelled && stderrChunks.length) {
        const message = stderrChunks.join("").trim();
        if (message) {
          reject(new GitHostError("forge_actions_runner_failed", message, {
            exitCode: Number(code) || 1,
          }));
          return;
        }
      }

      resolve({
        cancelled,
        exitCode: Number(code) || 0,
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

function executeNodeRunner(input: ExecuteActionsRunnerInput): ActionsRunnerExecution {
  const runnerInput = normalizeRunnerInput(input);
  let currentChild: ChildProcess | null = null;
  let killed = false;
  let cancelled = false;

  const handle: ActionsRunnerHandle = {
    get killed() {
      return killed;
    },
    kill(signal?: NodeJS.Signals | number) {
      killed = true;
      cancelled = signal === "SIGTERM" || signal === "SIGINT" || Number(signal) === 15 || Number(signal) === 2;
      try {
        return currentChild?.kill(typeof signal === "number" ? undefined : signal) ?? true;
      } catch {}
      return false;
    },
  };

  const completed = (async () => {
    const state = {
      lastStepIndex: -1,
      lastStepName: "",
    };

    const workspaceDirectory = await materializeWorkspace(runnerInput);
    await input.onEvent({
      status: "running",
      summary: "Running workflow steps.",
      type: "run.status",
    });

    for (const step of runnerInput.steps) {
      state.lastStepIndex = step.index;
      state.lastStepName = step.name;
      await input.onEvent({
        command: step.command,
        step_id: step.id,
        step_index: step.index,
        step_name: step.name,
        type: "step.started",
      });

      const shell = text(step.shell, runnerInput.shell) || "bash";
      const env = {
        ...process.env,
        ...(runnerInput.env || {}),
        ...(step.env || {}),
      };
      let outputPreview = "";

      const exitCode = await new Promise<number>((resolve, reject) => {
        currentChild = spawn(shell, ["-lc", step.command], {
          cwd: workspaceDirectory,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const heartbeat = setInterval(() => {
          void input.onEvent({
            step_id: step.id,
            step_index: step.index,
            step_name: step.name,
            type: "step.heartbeat",
          });
        }, Math.max(250, runnerInput.heartbeat_interval_ms));

        currentChild.stdout?.setEncoding("utf8");
        currentChild.stdout?.on("data", (chunk: string) => {
          outputPreview = appendPreview(outputPreview, chunk);
          void input.onEvent({
            chunk,
            step_id: step.id,
            step_index: step.index,
            step_name: step.name,
            stream: "stdout",
            type: "step.output",
          });
        });
        currentChild.stderr?.setEncoding("utf8");
        currentChild.stderr?.on("data", (chunk: string) => {
          outputPreview = appendPreview(outputPreview, chunk);
          void input.onEvent({
            chunk,
            step_id: step.id,
            step_index: step.index,
            step_name: step.name,
            stream: "stderr",
            type: "step.output",
          });
        });
        currentChild.on("error", (error) => {
          clearInterval(heartbeat);
          reject(error);
        });
        currentChild.on("close", (code, signal) => {
          clearInterval(heartbeat);
          if (signal === "SIGTERM" || signal === "SIGINT" || Number(code) === 130) {
            cancelled = true;
          }
          resolve(typeof code === "number" ? code : (cancelled ? 130 : 1));
        });
      });

      const stepStatus = cancelled
        ? "cancelled"
        : (exitCode === 0 ? "success" : "failed");
      await input.onEvent({
        exit_code: exitCode,
        output_preview: outputPreview,
        status: stepStatus,
        step_id: step.id,
        step_index: step.index,
        step_name: step.name,
        summary: cancelled
          ? `Cancelled during step ${step.name}.`
          : (exitCode === 0 ? `Completed step ${step.name}.` : `Failed step ${step.name}.`),
        type: "step.finished",
      });

      if (cancelled || exitCode !== 0) {
        return {
          cancelled,
          exitCode,
          lastStepIndex: state.lastStepIndex,
          lastStepName: state.lastStepName,
        };
      }
    }

    return {
      cancelled,
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

function executeActionsRunner(input: ExecuteActionsRunnerInput): ActionsRunnerExecution {
  const launch = resolveRunnerLaunch(input.actions);
  if (launch.kind === "go") {
    return executeGoRunner(input, launch);
  }
  return executeNodeRunner(input);
}

function resolveActionsWorkspaceRoot(options: CreateGitForgeActionsOptions | undefined, repositoryId: string, runId: string): string {
  const root = text(options?.workspaceRoot, path.join(os.tmpdir(), "@trebired-git-host-actions"));
  return path.join(root, repositoryId, runId);
}

export {
  executeActionsRunner,
  resolveActionsWorkspaceRoot,
};
