import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";

import {
  createGitForge,
  createGitForgeActivityRecorder,
  createGitForgeApiHandler,
  createGitForgeSocketServer,
  createGitHost,
  createInMemoryGitForgeStorageAdapter,
  resolveRepositoryPath,
} from "#rfvjfxzebkbs";
import { createGitApiClient } from "#qrrrat6gjo0q";
import {
  GitRepositoryActionRunPage,
  GitRepositoryActionsPage,
} from "#udv18x1zuger";
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
import type { GitForgeWorkflowRunEvent } from "#1mbdfxwwqqpa";

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
) {
  return createGitForge({
    actions: {
      heartbeatIntervalMs: 50,
      workspaceRoot: path.join(repositoriesRoot, ".actions"),
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

async function waitFor(check: () => boolean, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) return;
    await act(async () => {
      await sleep(25);
    });
  }
  throw new Error("Condition did not become true in time.");
}

describe("@trebired/git-host actions", () => {
  test("creates manual workflow runs, executes sequential shell steps, and uses the exact requested snapshot", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHostWithActivity(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "snapshot.txt", "first snapshot\n");
    await host.ensureRepository("demo", { actor });
    const firstCommit = git(["rev-parse", "HEAD"], workspace);

    writeFile(workspace, "snapshot.txt", "second snapshot\n");
    gitCommit(workspace, "Second snapshot");

    const workflow = await forge.createWorkflow("demo", {
      actor,
      name: "Build and Test",
      steps: [
        { name: "Snapshot", run: "cat snapshot.txt" },
        { name: "Stdout", run: "printf 'alpha\\n'" },
        { name: "Stderr", run: "printf 'beta\\n' 1>&2" },
      ],
      trigger: "manual",
    });

    const firstRun = await forge.runWorkflow("demo", workflow.id, {
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
    expect(completed.runner?.kind).toBe("local-host");
    expect(steps.map((step) => step.status)).toEqual(["success", "success", "success"]);
    expect(events.filter((event) => event.type === "step.started").map((event) => event.step_name)).toEqual(["Snapshot", "Stdout", "Stderr"]);
    expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("first snapshot"))).toBe(true);
    expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("second snapshot"))).toBe(false);
    expect(events.some((event) => event.type === "step.output" && event.stream === "stdout" && String(event.chunk || "").includes("alpha"))).toBe(true);
    expect(events.some((event) => event.type === "step.output" && event.stream === "stderr" && String(event.chunk || "").includes("beta"))).toBe(true);

    writeFile(workspace, "snapshot.txt", "third snapshot\n");
    gitCommit(workspace, "Third snapshot");
    const secondRun = await forge.runWorkflow("demo", workflow.id, {
      actor,
      ref: "HEAD",
    });
    await waitForRun(forge, "demo", secondRun.id);
    const runs = await forge.listWorkflowRuns("demo");
    expect(runs.map((entry) => entry.id).slice(0, 2)).toEqual([secondRun.id, firstRun.id]);
  }, { timeout: 20_000 });

  test("enqueues push-triggered and release-triggered workflows exactly once", async () => {
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

    const pushWorkflow = await forge.createWorkflow("demo", {
      actor,
      name: "On Push",
      source: { branches: ["main"] },
      steps: [{ name: "Push step", run: "printf 'push\\n'" }],
      trigger: "push",
    });
    await forge.createWorkflow("demo", {
      actor,
      name: "On Release",
      steps: [{ name: "Release step", run: "printf 'release\\n'" }],
      trigger: "release.create",
    });

    writeFile(workspace, "README.md", "# Actions v2\n");
    await host.stagePaths("demo");
    await host.commit("demo", {
      actor,
      message: "Push trigger commit",
    });
    await host.push("demo", {
      actor,
      setUpstream: true,
    });

    await waitForRunCount(forge, "demo", 1);
    const pushRuns = await forge.listWorkflowRuns("demo", {
      triggerKind: "push",
      workflowId: pushWorkflow.id,
    });
    expect(pushRuns).toHaveLength(1);
    expect((await waitForRun(forge, "demo", pushRuns[0].id)).status).toBe("success");

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
    });
    expect(releaseRuns).toHaveLength(1);
    expect((await waitForRun(forge, "demo", releaseRuns[0].id)).status).toBe("success");
  }, { timeout: 20_000 });

  test("streams workflow run events over the live socket and replays from a sequence cursor", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHostWithActivity(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Streaming\n");
    await host.ensureRepository("demo", { actor });

    const workflow = await forge.createWorkflow("demo", {
      actor,
      name: "Stream Logs",
      steps: [{ name: "Log step", run: "printf 'one\\n'; sleep 1; printf 'two\\n'; sleep 1" }],
      trigger: "manual",
    });

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
    const client = createGitApiClient({
      baseUrl: `http://127.0.0.1:${port}/api/git`,
      headers: actorHeaders(),
    });
    const run = await forge.runWorkflow("demo", workflow.id, { actor, ref: "HEAD" });

    const firstEvents: Array<GitForgeWorkflowRunEvent> = [];
    const replayedEvents: Array<GitForgeWorkflowRunEvent> = [];
    let firstOutputSequence = 0;

    try {
      let firstStream: ReturnType<typeof client.openWorkflowRunSocket> | null = null;
      const firstOutput = new Promise<void>((resolve) => {
        firstStream = client.openWorkflowRunSocket("demo", run.id, {
          onEvent(event) {
            if (!("sequence" in event)) return;
            firstEvents.push(event);
            if (event.type === "step.output" && !firstOutputSequence) {
              firstOutputSequence = event.sequence;
              firstStream?.close();
              resolve();
            }
          },
        });
        void firstStream.completed.catch(() => {});
      });

      await firstOutput;
      await sleep(100);

      const replayedOutput = new Promise<void>((resolve) => {
        const secondStream = client.openWorkflowRunSocket("demo", run.id, {
          afterSequence: firstOutputSequence,
          onEvent(event) {
            if (!("sequence" in event)) return;
            replayedEvents.push(event);
            if (event.sequence > firstOutputSequence && (event.type === "step.output" || event.type === "run.finished")) {
              secondStream.close();
              resolve();
            }
          },
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
    writeFile(workspace, "README.md", "# Cancel\n");
    await host.ensureRepository("demo", { actor });

    const workflow = await forge.createWorkflow("demo", {
      actor,
      name: "Cancelable",
      steps: [
        { name: "Long step", run: "printf 'start\\n'; sleep 3; printf 'late\\n'" },
        { name: "Never step", run: "printf 'after\\n'" },
      ],
      trigger: "manual",
    });
    const run = await forge.runWorkflow("demo", workflow.id, { actor, ref: "HEAD" });

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

  test("enforces actions permissions and renders repository Actions pages", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHostWithActivity(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Browser Actions\n");
    await host.ensureRepository("demo", { actor });

    const workflow = await forge.createWorkflow("demo", {
      actor,
      name: "Browser Workflow",
      steps: [{ name: "Build", run: "printf 'browser\\n'" }],
      trigger: "manual",
    });
    const run = await forge.runWorkflow("demo", workflow.id, { actor, ref: "HEAD" });
    await waitForRun(forge, "demo", run.id);

    const server = createServer(createGitForgeApiHandler({
      authorize({ operation, resource }) {
        if (operation === "create" && resource === "actions") return { allowed: false, message: "No configure access.", status: 403 };
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
    const client = createGitApiClient({
      baseUrl: `http://127.0.0.1:${port}/api/git`,
      headers: actorHeaders(),
    });

    let actionsRenderer: ReturnType<typeof createRenderer> | null = null;
    let runRenderer: ReturnType<typeof createRenderer> | null = null;

    try {
      const denied = await fetch(`http://127.0.0.1:${port}/api/git/repositories/demo/actions`, {
        body: JSON.stringify({
          name: "Denied",
          steps: [{ name: "Nope", run: "true" }],
          trigger: "manual",
        }),
        headers: actorHeaders(),
        method: "POST",
      });
      expect(denied.status).toBe(403);

      await expect(async () => {
        const stream = client.openWorkflowRunSocket("demo", run.id, {});
        await stream.completed;
      }).toThrow();

      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        if (!String(args[0] || "").includes("react-test-renderer is deprecated")) {
          originalConsoleError(...args as Parameters<typeof console.error>);
        }
      };

      try {
        await act(async () => {
          actionsRenderer = createRenderer(createElement(GitRepositoryActionsPage, {
            baseUrl: `http://127.0.0.1:${port}/api/git`,
            headers: actorHeaders(),
            repositoryKey: "demo",
          }));
        });
        await waitFor(() => JSON.stringify(actionsRenderer?.toJSON()).includes("Browser Workflow"));

        await act(async () => {
          runRenderer = createRenderer(createElement(GitRepositoryActionRunPage, {
            baseUrl: `http://127.0.0.1:${port}/api/git`,
            headers: actorHeaders(),
            repositoryKey: "demo",
            runId: run.id,
          }));
        });
        await waitFor(() => JSON.stringify(runRenderer?.toJSON()).includes("Live Logs"));

        expect(JSON.stringify(actionsRenderer?.toJSON())).toContain("Workflow Runs");
        expect(JSON.stringify(runRenderer?.toJSON())).toContain("Live Logs");
      } finally {
        console.error = originalConsoleError;
        await act(async () => {
          actionsRenderer?.unmount();
          runRenderer?.unmount();
        });
      }
    } finally {
      socketServer.disconnectSockets(true);
      await closeServer(server);
      socketServer.close();
    }
  }, { timeout: 20_000 });
});
