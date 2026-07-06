import { expect, test } from "bun:test";

import {
  actor,
  actorHeaders,
  closeServer,
  createActionsFixture,
  createGitForgeSocketServer,
  createServer,
  fs,
  listen,
  openWorkflowRunSocket,
  sleep,
  waitForRun,
  workflowDefinitionId,
  workflowYaml,
  writeFile,
  writeWorkflowFile,
} from "#l3cimsj7erri";
import { createGitForgeApiHandler } from "#rfvjfxzebkbs";

function resolveSocketActor(headers: Record<string, string | string[] | undefined>) {
  const actorId = Array.isArray(headers["x-actor-id"]) ? headers["x-actor-id"][0] : headers["x-actor-id"];
  return actorId ? { ...actor, id: String(actorId) } : null;
}

async function createSocketHarness(
  fixture: ReturnType<typeof createActionsFixture>,
  input: {
    authorizeApi?: Parameters<typeof createGitForgeApiHandler>[0]["authorize"];
    authorizeSocket?: Parameters<typeof createGitForgeSocketServer>[0]["authorize"];
  } = {},
) {
  const server = createServer(createGitForgeApiHandler({
    authorize: input.authorizeApi,
    basePath: "/api/git",
    forge: fixture.forge,
    gitHost: fixture.host,
    resolveActor(request) {
      return resolveSocketActor(request.headers);
    },
  }));
  const socketServer = createGitForgeSocketServer({
    authorize: input.authorizeSocket,
    basePath: "/api/git",
    forge: fixture.forge,
    gitHost: fixture.host,
    httpServer: server,
    resolveActor(request) {
      return resolveSocketActor(request.headers);
    },
  });
  const port = await listen(server);
  return { baseUrl: `http://127.0.0.1:${port}/api/git`, server, socketServer };
}

async function closeSocketHarness(harness: Awaited<ReturnType<typeof createSocketHarness>>) {
  harness.socketServer.disconnectSockets(true);
  await closeServer(harness.server);
  harness.socketServer.close();
}

async function captureReplayableSocketEvents(baseUrl: string, runId: string) {
  const firstEvents: any[] = [];
  const replayedEvents: any[] = [];
  let firstOutputSequence = 0;

  let firstStream: ReturnType<typeof openWorkflowRunSocket> | null = null;
  const firstOutput = new Promise<void>((resolve) => {
    firstStream = openWorkflowRunSocket({
      baseUrl,
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
      runId,
    });
    void firstStream.completed.catch(() => {});
  });

  await firstOutput;
  await sleep(100);

  const replayedOutput = new Promise<void>((resolve) => {
    const secondStream = openWorkflowRunSocket({
      afterSequence: firstOutputSequence,
      baseUrl,
      headers: actorHeaders(),
      onEvent(event) {
        replayedEvents.push(event);
        if (event.sequence > firstOutputSequence && (event.type === "step.output" || event.type === "run.finished")) {
          secondStream.close();
          resolve();
        }
      },
      repositoryKey: "demo",
      runId,
    });
    void secondStream.completed.catch(() => {});
  });

  await replayedOutput;
  return { firstEvents, firstOutputSequence, replayedEvents };
}

async function expectSocketRunReplay(baseUrl: string, runId: string) {
  const captured = await captureReplayableSocketEvents(baseUrl, runId);
  expect(captured.firstEvents.some((event) => event.type === "step.output")).toBe(true);
  expect(captured.replayedEvents.length).toBeGreaterThan(0);
  expect(captured.replayedEvents.every((event) => event.sequence > captured.firstOutputSequence)).toBe(true);
}

async function createSecuredActionsFixture() {
  const fixture = createActionsFixture();
  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeWorkflowFile(fixture.workspace, "secured.yml", workflowYaml({
    name: "Secured Workflow",
    steps: [{ name: "Build", run: "printf 'secure\\n'" }],
    trigger: "manual",
  }));
  writeFile(fixture.workspace, "README.md", "# Secure Actions\n");
  await fixture.host.ensureRepository("demo", { actor });
  await fixture.host.ensureRepository("empty", { actor });
  const run = await fixture.forge.runWorkflow("demo", workflowDefinitionId("secured.yml"), { actor, ref: "HEAD" });
  await waitForRun(fixture.forge, "demo", run.id);
  return { fixture, run };
}

test("streams workflow run events over the live socket and replays from a sequence cursor", async () => {
  const fixture = createActionsFixture();

  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeWorkflowFile(fixture.workspace, "stream-logs.yml", workflowYaml({
    name: "Stream Logs",
    steps: [{ name: "Log step", run: "printf 'one\\n'; sleep 1; printf 'two\\n'; sleep 1" }],
    trigger: "manual",
  }));
  writeFile(fixture.workspace, "README.md", "# Streaming\n");
  await fixture.host.ensureRepository("demo", { actor });

  const harness = await createSocketHarness(fixture);
  const run = await fixture.forge.runWorkflow("demo", workflowDefinitionId("stream-logs.yml"), { actor, ref: "HEAD" });

  try {
    await expectSocketRunReplay(harness.baseUrl, run.id);
    const completed = await waitForRun(fixture.forge, "demo", run.id);
    const persisted = await fixture.forge.listWorkflowRunEvents("demo", run.id);

    expect(completed.status).toBe("success");
    expect(persisted.some((event) => event.type === "run.finished")).toBe(true);
    expect(persisted.some((event) => event.type === "step.output" && String(event.chunk || "").includes("two"))).toBe(true);
  } finally {
    await closeSocketHarness(harness);
  }
}, { timeout: 30_000 });

test("cancels running workflow runs and preserves collected logs", async () => {
  const fixture = createActionsFixture();

  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeWorkflowFile(fixture.workspace, "cancelable.yml", workflowYaml({
    name: "Cancelable",
    steps: [
      { name: "Long step", run: "printf 'start\\n'; sleep 3; printf 'late\\n'" },
      { name: "Never step", run: "printf 'after\\n'" },
    ],
    trigger: "manual",
  }));
  writeFile(fixture.workspace, "README.md", "# Cancel\n");
  await fixture.host.ensureRepository("demo", { actor });

  const run = await fixture.forge.runWorkflow("demo", workflowDefinitionId("cancelable.yml"), { actor, ref: "HEAD" });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const events = await fixture.forge.listWorkflowRunEvents("demo", run.id);
    if (events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("start"))) {
      break;
    }
    await sleep(25);
  }

  await fixture.forge.cancelWorkflowRun("demo", run.id, { actor });
  const cancelled = await waitForRun(fixture.forge, "demo", run.id);
  const steps = await fixture.forge.listWorkflowRunSteps("demo", run.id);
  const events = await fixture.forge.listWorkflowRunEvents("demo", run.id);

  expect(cancelled.status).toBe("cancelled");
  expect(events.some((event) => event.type === "run.cancelled")).toBe(true);
  expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("start"))).toBe(true);
  expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("after"))).toBe(false);
  expect(steps[0]?.status).toBe("cancelled");
  expect(steps[1]?.status).toBe("cancelled");
}, { timeout: 20_000 });

test("repositories without workflow files stay empty", async () => {
  const { fixture } = await createSecuredActionsFixture();
  expect(await fixture.forge.listWorkflows("empty")).toEqual([]);
  expect(await fixture.forge.listWorkflowRuns("empty")).toEqual([]);
}, { timeout: 20_000 });

test("enforces actions run/socket permissions", async () => {
  const { fixture, run } = await createSecuredActionsFixture();
  const harness = await createSocketHarness(fixture, {
    authorizeApi({ operation, resource }) {
      if (operation === "run" && resource === "actions") return { allowed: false, message: "No run access.", status: 403 };
      return true;
    },
    authorizeSocket() {
      return { allowed: false, message: "No socket access.", status: 403 };
    },
  });

  try {
    const denied = await fetch(`${harness.baseUrl}/repositories/demo/actions/runs`, {
      body: JSON.stringify({
        ref: "HEAD",
        workflowId: workflowDefinitionId("secured.yml"),
      }),
      headers: actorHeaders(),
      method: "POST",
    });
    expect(denied.status).toBe(403);

    const listed = await fetch(`${harness.baseUrl}/repositories/demo/actions`, {
      headers: actorHeaders(),
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      ok: true,
    });

    const stream = openWorkflowRunSocket({
      baseUrl: harness.baseUrl,
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
    await closeSocketHarness(harness);
  }
}, { timeout: 20_000 });
