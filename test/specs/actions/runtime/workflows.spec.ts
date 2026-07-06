import { expect, test } from "bun:test";

import {
  actor,
  createActionsForge,
  createGitForgeActivityRecorder,
  createHostWithActivity,
  fs,
  git,
  gitCommit,
  path,
  resolveRepositoryPath,
  tempDir,
  waitForRun,
  waitForRunCount,
  workflowDefinitionId,
  workflowYaml,
  writeFile,
  writeWorkflowFile,
} from "#l3cimsj7erri";
import { createInMemoryGitForgeStorageAdapter } from "#rfvjfxzebkbs";

function createWorkflowFixture(
  workflowRoot = ".git-host",
  activity = undefined as ReturnType<typeof createGitForgeActivityRecorder> | undefined,
  root = tempDir(),
  storage = createInMemoryGitForgeStorageAdapter(),
) {
  const repositoriesRoot = path.join(root, "repos");
  const host = createHostWithActivity(repositoriesRoot, activity);
  const forge = createActionsForge(repositoriesRoot, host, storage, {
    workflowRoot,
  });
  const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });
  return { forge, host, repositoriesRoot, root, storage, workspace };
}

function expectSnapshotRunEvents(events: Awaited<ReturnType<ReturnType<typeof createActionsForge>["listWorkflowRunEvents"]>>) {
  expect(events.filter((event) => event.type === "step.started").map((event) => event.step_name)).toEqual(["Snapshot", "Stdout", "Stderr"]);
  expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("first snapshot"))).toBe(true);
  expect(events.some((event) => String(event.chunk || "").includes("second snapshot"))).toBe(false);
  expect(events.some((event) => event.stream === "stdout" && String(event.chunk || "").includes("alpha"))).toBe(true);
  expect(events.some((event) => event.stream === "stderr" && String(event.chunk || "").includes("beta"))).toBe(true);
}

async function seedRemoteRepository(
  host: ReturnType<typeof createHostWithActivity>,
  workspace: string,
  remoteRepo: string,
) {
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
}

function writeSnapshotWorkflow(workspace: string) {
  writeWorkflowFile(workspace, "build-and-test.yml", workflowYaml({
    name: "Build and Test",
    steps: [
      { name: "Snapshot", run: "cat snapshot.txt" },
      { name: "Stdout", run: "printf 'alpha\\n'" },
      { name: "Stderr", run: "printf 'beta\\n' 1>&2" },
    ],
    trigger: "manual",
  }), ".ci");
}

function installTriggeredWorkflows(workspace: string) {
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
}

async function expectTriggeredWorkflowSuccess(
  forge: ReturnType<typeof createActionsForge>,
  workflowId: string,
  triggerKind: string,
) {
  const runs = await forge.listWorkflowRuns("demo", { triggerKind, workflowId });
  expect(runs).toHaveLength(1);
  expect((await waitForRun(forge, "demo", runs[0]!.id)).status).toBe("success");
}

test("loads workflow files from a configurable root and executes against the requested snapshot", async () => {
  const { forge, host, repositoriesRoot, workspace } = createWorkflowFixture(".ci");

  fs.mkdirSync(workspace, { recursive: true });
  writeSnapshotWorkflow(workspace);
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
  expect(completed.runner?.kind).toBe("local");
  expect(steps.map((step) => step.status)).toEqual(["success", "success", "success"]);
  expectSnapshotRunEvents(events);

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
  const { forge, host, workspace } = createWorkflowFixture(".git-host", activity, root, storage);

  fs.mkdirSync(path.dirname(remoteRepo), { recursive: true });
  git(["init", "--bare", "--initial-branch", "main", remoteRepo]);
  await seedRemoteRepository(host, workspace, remoteRepo);

  installTriggeredWorkflows(workspace);
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
  await expectTriggeredWorkflowSuccess(forge, workflowDefinitionId("on-push.yml"), "push");

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
  await expectTriggeredWorkflowSuccess(forge, workflowDefinitionId("on-release.yml"), "release.create");
}, { timeout: 20_000 });
