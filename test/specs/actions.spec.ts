import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { io as connectSocket } from "socket.io-client";

import {
  createGitForge,
  createGitForgeActivityRecorder,
  createGitForgeApiHandler,
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
} from "./helpers.js";

const actor = {
  email: "alice@example.com",
  id: "alice",
  name: "Alice",
};

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

function openWorkflowRunSocket(input: {
  afterSequence?: number;
  baseUrl: string;
  headers?: Record<string, string>;
  onDone?: (payload: Record<string, unknown>) => void | Promise<void>;
  onError?: (payload: Record<string, unknown>) => void | Promise<void>;
  onEvent?: (event: GitForgeWorkflowRunEvent) => void | Promise<void>;
  repositoryKey: string;
  runId: string;
}) {
  const base = new URL(input.baseUrl);
  const pathName = `${base.pathname.replace(/\/+$/g, "") || ""}/socket.io`;
  const socket = connectSocket(`${base.protocol}//${base.host}`, {
    autoConnect: false,
    extraHeaders: input.headers,
    path: pathName.startsWith("/") ? pathName : `/${pathName}`,
    transports: ["websocket"],
  });

  let settled = false;
  let resolveCompleted: (() => void) | null = null;
  let rejectCompleted: ((reason?: unknown) => void) | null = null;

  const cleanup = () => {
    socket.off("connect");
    socket.off("connect_error");
    socket.off(ACTIONS_RUN_EVENT);
    socket.off(ACTIONS_RUN_DONE_EVENT);
    socket.off(ACTIONS_RUN_ERROR_EVENT);
  };

  const completed = new Promise<void>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  const finish = (kind: "resolve" | "reject", value?: unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    socket.disconnect();
    if (kind === "resolve") resolveCompleted?.();
    else rejectCompleted?.(value);
  };

  socket.on("connect", () => {
    socket.emit(ACTIONS_RUN_SUBSCRIBE_EVENT, {
      afterSequence: input.afterSequence,
      repositoryKey: input.repositoryKey,
      runId: input.runId,
    });
  });
  socket.on("connect_error", (error) => {
    finish("reject", error);
  });
  socket.on(ACTIONS_RUN_EVENT, async (event: GitForgeWorkflowRunEvent) => {
    await input.onEvent?.(event);
  });
  socket.on(ACTIONS_RUN_DONE_EVENT, async (payload: Record<string, unknown>) => {
    await input.onDone?.(payload);
    finish(payload.ok === false ? "reject" : "resolve", payload);
  });
  socket.on(ACTIONS_RUN_ERROR_EVENT, async (payload: Record<string, unknown>) => {
    await input.onError?.(payload);
    finish("reject", payload);
  });
  socket.connect();

  return {
    close() {
      finish("reject", new Error("Socket closed by test."));
    },
    completed,
  };
}

describe("@trebired/git-host actions", () => {
  test("loads workflow files from a configurable root and executes against the requested snapshot", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHostWithActivity(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage, {
      workflowRoot: ".ci",
    });
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeWorkflowFile(workspace, "build-and-test.yml", workflowYaml({
      name: "Build and Test",
      steps: [
        { name: "Snapshot", run: "cat snapshot.txt" },
        { name: "Stdout", run: "printf 'alpha\\n'" },
        { name: "Stderr", run: "printf 'beta\\n' 1>&2" },
      ],
      trigger: "manual",
    }), ".ci");
    writeFile(workspace, "snapshot.txt", "first snapshot\n");
    await host.ensureRepository("demo", { actor });
    const firstCommit = git(["rev-parse", "HEAD"], workspace);

    writeFile(workspace, "snapshot.txt", "second snapshot\n");
    gitCommit(workspace, "Second snapshot");

    const workflows = await forge.listWorkflows("demo");
    expect(workflows).toHaveLength(1);
    expect(workflows[0]?.id).toBe(workflowDefinitionId("build-and-test.yml", ".ci"));
    expect(workflows[0]?.definition_path).toBe(workflowDefinitionId("build-and-test.yml", ".ci"));
    expect(workflows[0]?.origin).toBe("file");

    const firstRun = await forge.runWorkflow("demo", workflowDefinitionId("build-and-test.yml", ".ci"), {
      actor,
      commitHash: firstCommit,
      ref: firstCommit,
      triggerContext: {
        requested_by: "manual-test",
      },
    });
    const completed = await waitForRun(forge, "demo", firstRun.id);
    const steps = await forge.listWorkflowRunSteps("demo", firstRun.id);
    const events = await forge.listWorkflowRunEvents("demo", firstRun.id);

    expect(completed.status).toBe("success");
    expect(completed.created_by).toBe("alice");
    expect(completed.runner?.kind).toBe("go-runner");
    expect(steps.map((step) => step.status)).toEqual(["success", "success", "success"]);
    expect(events.filter((event) => event.type === "step.started").map((event) => event.step_name)).toEqual(["Snapshot", "Stdout", "Stderr"]);
    expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("first snapshot"))).toBe(true);
    expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("second snapshot"))).toBe(false);
    expect(events.some((event) => event.type === "step.output" && event.stream === "stdout" && String(event.chunk || "").includes("alpha"))).toBe(true);
    expect(events.some((event) => event.type === "step.output" && event.stream === "stderr" && String(event.chunk || "").includes("beta"))).toBe(true);

    writeFile(workspace, "snapshot.txt", "third snapshot\n");
    gitCommit(workspace, "Third snapshot");
    const secondRun = await forge.runWorkflow("demo", workflowDefinitionId("build-and-test.yml", ".ci"), {
      actor,
      ref: "HEAD",
    });
    await waitForRun(forge, "demo", secondRun.id);
    const runs = await forge.listWorkflowRuns("demo");
    expect(runs.map((entry) => entry.id).slice(0, 2)).toEqual([secondRun.id, firstRun.id]);
  }, { timeout: 20_000 });

  test("enqueues push-triggered and release-triggered workflow files exactly once", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const remoteRepo = path.join(root, "remote", "origin.git");
    const storage = createInMemoryGitForgeStorageAdapter();
    const activity = createGitForgeActivityRecorder({ storage: storage.activity });
    const host = createHostWithActivity(repositoriesRoot, activity);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(path.dirname(remoteRepo), { recursive: true });
    git(["init", "--bare", "--initial-branch", "main", remoteRepo]);

    await host.ensureRepository("demo", {
      actor,
      cloneUrl: remoteRepo,
      remoteUrl: remoteRepo,
    });
    writeFile(workspace, "README.md", "# Actions\n");
    await host.stagePaths("demo");
    await host.commit("demo", {
      actor,
      message: "Seed repository",
    });
    await host.push("demo", {
      actor,
      setUpstream: true,
    });

    writeWorkflowFile(workspace, "on-push.yml", workflowYaml({
      branches: ["main"],
      name: "On Push",
      steps: [{ name: "Push step", run: "printf 'push\\n'" }],
      trigger: "push",
    }));
    writeWorkflowFile(workspace, "on-release.yml", workflowYaml({
      name: "On Release",
      steps: [{ name: "Release step", run: "printf 'release\\n'" }],
      trigger: "release.create",
    }));
    writeFile(workspace, "README.md", "# Actions v2\n");
    await host.stagePaths("demo");
    await host.commit("demo", {
      actor,
      message: "Add workflow files",
    });
    await host.push("demo", {
      actor,
      setUpstream: true,
    });

    await waitForRunCount(forge, "demo", 1);
    const pushRuns = await forge.listWorkflowRuns("demo", {
      triggerKind: "push",
      workflowId: workflowDefinitionId("on-push.yml"),
    });
    expect(pushRuns).toHaveLength(1);
    expect((await waitForRun(forge, "demo", pushRuns[0]!.id)).status).toBe("success");

    await host.createTag("demo", {
      actor,
      message: "Release trigger",
      name: "v1",
      ref: "main",
    });
    await forge.createRelease("demo", {
      actor,
      existingTagName: "v1",
      notes: "Published from tests.",
      title: "Version 1",
    });

    await waitForRunCount(forge, "demo", 2);
    const releaseRuns = await forge.listWorkflowRuns("demo", {
      triggerKind: "release.create",
      workflowId: workflowDefinitionId("on-release.yml"),
    });
    expect(releaseRuns).toHaveLength(1);
    expect((await waitForRun(forge, "demo", releaseRuns[0]!.id)).status).toBe("success");
  }, { timeout: 20_000 });

  test("streams workflow run events over the live socket and replays from a sequence cursor", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHostWithActivity(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeWorkflowFile(workspace, "stream-logs.yml", workflowYaml({
      name: "Stream Logs",
      steps: [{ name: "Log step", run: "printf 'one\\n'; sleep 1; printf 'two\\n'; sleep 1" }],
      trigger: "manual",
    }));
    writeFile(workspace, "README.md", "# Streaming\n");
    await host.ensureRepository("demo", { actor });

    const server = createServer(createGitForgeApiHandler({
      basePath: "/api/git",
      forge,
      gitHost: host,
      resolveActor(request) {
        const actorId = Array.isArray(request.headers["x-actor-id"]) ? request.headers["x-actor-id"][0] : request.headers["x-actor-id"];
        return actorId ? { ...actor, id: String(actorId) } : null;
      },
    }));
    const socketServer = createGitForgeSocketServer({
      basePath: "/api/git",
      forge,
      gitHost: host,
      httpServer: server,
      resolveActor(request) {
        const actorId = Array.isArray(request.headers["x-actor-id"]) ? request.headers["x-actor-id"][0] : request.headers["x-actor-id"];
        return actorId ? { ...actor, id: String(actorId) } : null;
      },
    });
    const port = await listen(server);
    const run = await forge.runWorkflow("demo", workflowDefinitionId("stream-logs.yml"), { actor, ref: "HEAD" });

    const firstEvents: Array<GitForgeWorkflowRunEvent> = [];
    const replayedEvents: Array<GitForgeWorkflowRunEvent> = [];
    let firstOutputSequence = 0;

    try {
      let firstStream: ReturnType<typeof openWorkflowRunSocket> | null = null;
      const firstOutput = new Promise<void>((resolve) => {
        firstStream = openWorkflowRunSocket({
          baseUrl: `http://127.0.0.1:${port}/api/git`,
          headers: actorHeaders(),
          onEvent(event) {
            firstEvents.push(event);
            if (event.type === "step.output" && !firstOutputSequence) {
              firstOutputSequence = event.sequence;
              firstStream?.close();
              resolve();
            }
          },
          repositoryKey: "demo",
          runId: run.id,
        });
        void firstStream.completed.catch(() => {});
      });

      await firstOutput;
      await sleep(100);

      const replayedOutput = new Promise<void>((resolve) => {
        const secondStream = openWorkflowRunSocket({
          afterSequence: firstOutputSequence,
          baseUrl: `http://127.0.0.1:${port}/api/git`,
          headers: actorHeaders(),
          onEvent(event) {
            replayedEvents.push(event);
            if (event.sequence > firstOutputSequence && (event.type === "step.output" || event.type === "run.finished")) {
              secondStream.close();
              resolve();
            }
          },
          repositoryKey: "demo",
          runId: run.id,
        });
        void secondStream.completed.catch(() => {});
      });
      await replayedOutput;

      const completed = await waitForRun(forge, "demo", run.id);
      const persisted = await forge.listWorkflowRunEvents("demo", run.id);
      expect(completed.status).toBe("success");
      expect(firstEvents.some((event) => event.type === "step.output")).toBe(true);
      expect(replayedEvents.length).toBeGreaterThan(0);
      expect(replayedEvents.every((event) => event.sequence > firstOutputSequence)).toBe(true);
      expect(persisted.some((event) => event.type === "run.finished")).toBe(true);
      expect(persisted.some((event) => event.type === "step.output" && String(event.chunk || "").includes("two"))).toBe(true);
    } finally {
      socketServer.disconnectSockets(true);
      await closeServer(server);
      socketServer.close();
    }
  }, { timeout: 30_000 });

  test("cancels running workflow runs and preserves collected logs", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHostWithActivity(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeWorkflowFile(workspace, "cancelable.yml", workflowYaml({
      name: "Cancelable",
      steps: [
        { name: "Long step", run: "printf 'start\\n'; sleep 3; printf 'late\\n'" },
        { name: "Never step", run: "printf 'after\\n'" },
      ],
      trigger: "manual",
    }));
    writeFile(workspace, "README.md", "# Cancel\n");
    await host.ensureRepository("demo", { actor });

    const run = await forge.runWorkflow("demo", workflowDefinitionId("cancelable.yml"), { actor, ref: "HEAD" });

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const events = await forge.listWorkflowRunEvents("demo", run.id);
      if (events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("start"))) {
        break;
      }
      await sleep(25);
    }

    await forge.cancelWorkflowRun("demo", run.id, { actor });
    const cancelled = await waitForRun(forge, "demo", run.id);
    const steps = await forge.listWorkflowRunSteps("demo", run.id);
    const events = await forge.listWorkflowRunEvents("demo", run.id);

    expect(cancelled.status).toBe("cancelled");
    expect(events.some((event) => event.type === "run.cancelled")).toBe(true);
    expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("start"))).toBe(true);
    expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("after"))).toBe(false);
    expect(steps[0]?.status).toBe("cancelled");
    expect(steps[1]?.status).toBe("cancelled");
  }, { timeout: 20_000 });

  test("enforces actions run/socket permissions and repositories without workflow files stay empty", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHostWithActivity(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeWorkflowFile(workspace, "secured.yml", workflowYaml({
      name: "Secured Workflow",
      steps: [{ name: "Build", run: "printf 'secure\\n'" }],
      trigger: "manual",
    }));
    writeFile(workspace, "README.md", "# Secure Actions\n");
    await host.ensureRepository("demo", { actor });
    await host.ensureRepository("empty", { actor });

    const run = await forge.runWorkflow("demo", workflowDefinitionId("secured.yml"), { actor, ref: "HEAD" });
    await waitForRun(forge, "demo", run.id);

    expect(await forge.listWorkflows("empty")).toEqual([]);
    expect(await forge.listWorkflowRuns("empty")).toEqual([]);

    const server = createServer(createGitForgeApiHandler({
      authorize({ operation, resource }) {
        if (operation === "run" && resource === "actions") return { allowed: false, message: "No run access.", status: 403 };
        return true;
      },
      basePath: "/api/git",
      forge,
      gitHost: host,
      resolveActor(request) {
        const actorId = Array.isArray(request.headers["x-actor-id"]) ? request.headers["x-actor-id"][0] : request.headers["x-actor-id"];
        return actorId ? { ...actor, id: String(actorId) } : null;
      },
    }));
    const socketServer = createGitForgeSocketServer({
      authorize() {
        return { allowed: false, message: "No socket access.", status: 403 };
      },
      basePath: "/api/git",
      forge,
      gitHost: host,
      httpServer: server,
      resolveActor(request) {
        const actorId = Array.isArray(request.headers["x-actor-id"]) ? request.headers["x-actor-id"][0] : request.headers["x-actor-id"];
        return actorId ? { ...actor, id: String(actorId) } : null;
      },
    });
    const port = await listen(server);

    try {
      const denied = await fetch(`http://127.0.0.1:${port}/api/git/repositories/demo/actions/runs`, {
        body: JSON.stringify({
          ref: "HEAD",
          workflowId: workflowDefinitionId("secured.yml"),
        }),
        headers: actorHeaders(),
        method: "POST",
      });
      expect(denied.status).toBe(403);

      const listed = await fetch(`http://127.0.0.1:${port}/api/git/repositories/demo/actions`, {
        headers: actorHeaders(),
      });
      expect(listed.status).toBe(200);
      expect(await listed.json()).toMatchObject({
        ok: true,
      });

      const stream = openWorkflowRunSocket({
        baseUrl: `http://127.0.0.1:${port}/api/git`,
        headers: actorHeaders(),
        repositoryKey: "demo",
        runId: run.id,
      });
      await expect(stream.completed).rejects.toMatchObject({
        error: {
          code: "permission_denied",
        },
        status: 403,
      });
    } finally {
      socketServer.disconnectSockets(true);
      await closeServer(server);
      socketServer.close();
    }
  }, { timeout: 20_000 });
});
