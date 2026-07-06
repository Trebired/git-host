import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { io as connectSocket } from "socket.io-client";

import {
  createBubblewrapSandbox,
  createGitForge,
  createGitForgeActivityRecorder,
  createGitForgeSocketServer,
  createGitHost,
  createInMemoryGitForgeStorageAdapter,
  resolveRepositoryPath,
} from "#rfvjfxzebkbs";
import type {
  CreateGitForgeActionsOptions,
  GitForgeWorkflowRunEvent,
} from "#1mbdfxwwqqpa";
import {
  ACTIONS_RUN_DONE_EVENT,
  ACTIONS_RUN_ERROR_EVENT,
  ACTIONS_RUN_EVENT,
  ACTIONS_RUN_SUBSCRIBE_EVENT,
} from "#e1ead083c558";
import {
  closeServer,
  createServer,
  git,
  gitCommit,
  listen,
  sleep,
  tempDir,
  writeFile,
} from "#cx668v9vcf0v";

const actor = {
  email: "alice@example.com",
  id: "alice",
  name: "Alice",
};

function bubblewrapWorks() {
  try {
    const spec = createBubblewrapSandbox()({
      args: [],
      command: "true",
      cwd: process.cwd(),
      env: { PATH: process.env.PATH || "" },
    });
    const result = spawnSync(spec.command, spec.args, { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

function actorHeaders(actorId = actor.id) {
  return {
    "content-type": "application/json",
    "x-actor-id": actorId,
  };
}

function createHostWithActivity(rootDir: string, activity = undefined as ReturnType<typeof createGitForgeActivityRecorder> | undefined) {
  return createGitHost({
    activity,
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({
          rootDir,
          repositoryPath: `${repositoryId}/workspace`,
        }),
      };
    },
  });
}

function createActionsForge(
  repositoriesRoot: string,
  host: ReturnType<typeof createHostWithActivity>,
  storage: ReturnType<typeof createInMemoryGitForgeStorageAdapter>,
  actions: CreateGitForgeActionsOptions = {},
) {
  return createGitForge({
    actions: {
      heartbeatIntervalMs: 50,
      workspaceRoot: path.join(repositoriesRoot, ".actions"),
      ...actions,
    },
    createForkRepository({ upstreamRepositoryId }) {
      return {
        id: `${upstreamRepositoryId}-fork`,
        path: resolveRepositoryPath({
          rootDir: repositoriesRoot,
          repositoryPath: `${upstreamRepositoryId}-fork/workspace`,
        }),
      };
    },
    gitHost: host,
    storage,
  });
}

function workflowYaml(input: {
  name: string;
  steps: Array<{ name: string; run: string }>;
  trigger: string;
  branches?: string[];
}) {
  const branchBlock = input.branches?.length
    ? `source:\n  branches:\n${input.branches.map((branch) => `    - ${branch}`).join("\n")}\n`
    : "";
  return [
    `name: ${input.name}`,
    `trigger: ${input.trigger}`,
    branchBlock.trimEnd(),
    "steps:",
    ...input.steps.flatMap((step) => [
      `  - name: ${step.name}`,
      `    run: |`,
      ...String(step.run).split("\n").map((line) => `      ${line}`),
    ]),
    "",
  ].filter(Boolean).join("\n");
}

function writeWorkflowFile(workspace: string, fileName: string, content: string, workflowRoot = ".git-host") {
  writeFile(workspace, `${workflowRoot}/workflows/${fileName}`, `${content.trim()}\n`);
}

function workflowDefinitionId(fileName: string, workflowRoot = ".git-host") {
  return `${workflowRoot}/workflows/${fileName}`;
}

function stepOutputText(events: GitForgeWorkflowRunEvent[]) {
  return events
    .filter((event) => event.type === "step.output")
    .map((event) => String(event.chunk || ""))
    .join("");
}

function createActionsFixture(
  repositoryId = "demo",
  actions: CreateGitForgeActionsOptions = {},
  activity = undefined as ReturnType<typeof createGitForgeActivityRecorder> | undefined,
) {
  const root = tempDir();
  const repositoriesRoot = path.join(root, "repos");
  const storage = createInMemoryGitForgeStorageAdapter();
  const host = createHostWithActivity(repositoriesRoot, activity);
  const forge = createActionsForge(repositoriesRoot, host, storage, actions);
  const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: `${repositoryId}/workspace` });
  return { forge, host, repositoriesRoot, root, storage, workspace };
}

async function runProbeWorkflow(input: {
  actions?: CreateGitForgeActionsOptions;
  runInput?: Parameters<ReturnType<typeof createActionsForge>["runWorkflow"]>[2];
  script: string[];
}) {
  const fixture = createActionsFixture("demo", input.actions || {});
  const runBody = input.script.map((line) => `          ${line}`).join("\n");

  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeWorkflowFile(fixture.workspace, "env-probe.yml", `
name: Env Probe
on:
  workflow_dispatch:
jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - name: Probe
        run: |
${runBody}
`, ".git-host");
  writeFile(fixture.workspace, "README.md", "# Env Probe\n");
  await fixture.host.ensureRepository("demo", { actor });

  const run = await fixture.forge.runWorkflow("demo", workflowDefinitionId("env-probe.yml"), {
    actor,
    ref: "HEAD",
    ...(input.runInput || {}),
  });
  const completed = await waitForRun(fixture.forge, "demo", run.id);
  const events = await fixture.forge.listWorkflowRunEvents("demo", run.id);
  return {
    completed,
    events,
    output: stepOutputText(events),
  };
}

async function waitForRun(
  forge: ReturnType<typeof createActionsForge>,
  repositoryId: string,
  runId: string,
  attempts = 200,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const run = await forge.readWorkflowRun(repositoryId, runId);
    if (["cancelled", "failed", "skipped", "success"].includes(run.status)) {
      return run;
    }
    await sleep(25);
  }
  throw new Error(`Workflow run "${runId}" did not reach a terminal status.`);
}

async function waitForRunCount(
  forge: ReturnType<typeof createActionsForge>,
  repositoryId: string,
  count: number,
  attempts = 200,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const runs = await forge.listWorkflowRuns(repositoryId);
    if (runs.length >= count) return runs;
    await sleep(25);
  }
  throw new Error(`Repository "${repositoryId}" did not reach ${count} workflow runs.`);
}

function createSocketClient(baseUrl: string, headers?: Record<string, string>) {
  const base = new URL(baseUrl);
  const pathName = `${base.pathname.replace(/\/+$/g, "") || ""}/socket.io`;
  return connectSocket(`${base.protocol}//${base.host}`, {
    autoConnect: false,
    extraHeaders: headers,
    path: pathName.startsWith("/") ? pathName : `/${pathName}`,
    transports: ["websocket"],
  });
}

function createSocketCompletion(socket: ReturnType<typeof connectSocket>) {
  let settled = false;
  let resolveCompleted: (() => void) | null = null;
  let rejectCompleted: ((reason?: unknown) => void) | null = null;

  const completed = new Promise<void>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  return {
    completed,
    finish(kind: "resolve" | "reject", value?: unknown) {
      if (settled) return;
      settled = true;
      socket.disconnect();
      if (kind === "resolve") resolveCompleted?.();
      else rejectCompleted?.(value);
    },
  };
}

function bindWorkflowRunSocket(input: {
  afterSequence?: number;
  baseUrl: string;
  headers?: Record<string, string>;
  onDone?: (payload: Record<string, unknown>) => void | Promise<void>;
  onError?: (payload: Record<string, unknown>) => void | Promise<void>;
  onEvent?: (event: GitForgeWorkflowRunEvent) => void | Promise<void>;
  repositoryKey: string;
  runId: string;
}) {
  const socket = createSocketClient(input.baseUrl, input.headers);
  const state = createSocketCompletion(socket);

  socket.on("connect", () => {
    socket.emit(ACTIONS_RUN_SUBSCRIBE_EVENT, {
      afterSequence: input.afterSequence,
      repositoryKey: input.repositoryKey,
      runId: input.runId,
    });
  });
  socket.on("connect_error", (error) => {
    state.finish("reject", error);
  });
  socket.on(ACTIONS_RUN_EVENT, async (event: GitForgeWorkflowRunEvent) => {
    await input.onEvent?.(event);
  });
  socket.on(ACTIONS_RUN_DONE_EVENT, async (payload: Record<string, unknown>) => {
    await input.onDone?.(payload);
    state.finish(payload.ok === false ? "reject" : "resolve", payload);
  });
  socket.on(ACTIONS_RUN_ERROR_EVENT, async (payload: Record<string, unknown>) => {
    await input.onError?.(payload);
    state.finish("reject", payload);
  });
  socket.connect();

  return {
    close() {
      state.finish("reject", new Error("Socket closed by test."));
    },
    completed: state.completed,
  };
}

export {
  actor,
  actorHeaders,
  bindWorkflowRunSocket as openWorkflowRunSocket,
  bubblewrapWorks,
  closeServer,
  createActionsFixture,
  createActionsForge,
  createBubblewrapSandbox,
  createGitForgeActivityRecorder,
  createGitForgeSocketServer,
  createHostWithActivity,
  createServer,
  fs,
  git,
  gitCommit,
  listen,
  path,
  resolveRepositoryPath,
  runProbeWorkflow,
  sleep,
  stepOutputText,
  tempDir,
  waitForRun,
  waitForRunCount,
  workflowDefinitionId,
  workflowYaml,
  writeFile,
  writeWorkflowFile,
};
