import { expect, test } from "bun:test";

import {
  actor,
  createActionsFixture,
  fs,
  git,
  sleep,
  waitForRun,
  waitForRunCount,
  workflowDefinitionId,
  writeFile,
  writeWorkflowFile,
} from "./helpers.js";

const matrixWorkflow = `
name: Matrix Build
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target:
          - linux
          - darwin
    steps:
      - name: Write build artifact
        run: |
          mkdir -p dist
          printf '%s\\n' "\${{ matrix.target }}" > "dist/\${{ matrix.target }}.txt"
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: build-\${{ matrix.target }}
          path: dist/\${{ matrix.target }}.txt
  publish:
    needs: build
    runs-on: ubuntu-latest
    if: \${{ needs.build.result == 'success' }}
    steps:
      - name: Download linux build
        uses: actions/download-artifact@v4
        with:
          name: build-linux
          path: gathered
      - name: Show linux build
        run: cat gathered/dist/linux.txt
`;

async function createWorkflowRepository(
  fileName: string,
  workflow: string,
  readme = "# Workflow\n",
) {
  const fixture = createActionsFixture();
  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeWorkflowFile(fixture.workspace, fileName, workflow, ".git-host");
  writeFile(fixture.workspace, "README.md", readme);
  await fixture.host.ensureRepository("demo", { actor });
  return fixture;
}

function expectArtifactEvent(events: Awaited<ReturnType<ReturnType<typeof createActionsFixture>["forge"]["listWorkflowRunEvents"]>>, type: string, name: string) {
  expect(events.some((event) => event.type === type && event.artifact_name === name)).toBe(true);
}

async function waitUntilRunStarts(fixture: ReturnType<typeof createActionsFixture>, runId: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const current = await fixture.forge.readWorkflowRun("demo", runId);
    if (["running", "starting"].includes(current.status)) return;
    await sleep(25);
  }
}

async function recordPushActivity(
  fixture: ReturnType<typeof createActionsFixture>,
  id: string,
  metadata: Record<string, string>,
  summary: string,
) {
  await fixture.storage.activity.createActivity({
    actor_id: actor.id,
    actor_label: actor.name,
    created_at: new Date().toISOString(),
    id,
    kind: "repository.push",
    metadata,
    repository_id: "demo",
    source: "forge",
    summary,
  });
}

test("expands matrix jobs, enforces needs ordering, and moves artifacts across jobs", async () => {
  const fixture = await createWorkflowRepository("matrix.yml", matrixWorkflow, "# Matrix\n");

  const run = await fixture.forge.runWorkflow("demo", workflowDefinitionId("matrix.yml"), {
    actor,
    ref: "HEAD",
  });
  const completed = await waitForRun(fixture.forge, "demo", run.id);
  const jobs = await fixture.forge.listWorkflowRunJobs("demo", run.id);
  const steps = await fixture.forge.listWorkflowRunSteps("demo", run.id);
  const artifacts = await fixture.forge.listWorkflowRunArtifacts("demo", run.id);
  const events = await fixture.forge.listWorkflowRunEvents("demo", run.id);

  expect(completed.status).toBe("success");
  expect(jobs).toHaveLength(3);
  expect(jobs.filter((job) => job.job_id === "build")).toHaveLength(2);
  expect(jobs.every((job) => job.status === "success")).toBe(true);
  expect(artifacts.map((artifact) => artifact.name).sort()).toEqual(["build-darwin", "build-linux"]);
  expectArtifactEvent(events, "artifact.uploaded", "build-linux");
  expectArtifactEvent(events, "artifact.downloaded", "build-linux");
  expect(events.some((event) => event.type === "step.output" && String(event.chunk || "").includes("linux"))).toBe(true);
  const publishStarted = events.find((event) => event.type === "job.started" && event.job_id === "publish");
  const lastBuildFinished = [...events].reverse().find((event) => event.type === "job.finished" && event.job_id === "build");
  expect(Number(publishStarted?.sequence || 0)).toBeGreaterThan(Number(lastBuildFinished?.sequence || 0));
  expect(steps.some((step) => step.kind === "uses")).toBe(true);
}, { timeout: 20_000 });

test("cancels in-progress runs in the same concurrency group", async () => {
  const fixture = await createWorkflowRepository("concurrency.yml", `
name: Publish
on:
  workflow_dispatch:
concurrency:
  group: publish-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Wait
        run: |
          printf 'start\\n'
          sleep 2
          printf 'done\\n'
`, "# Concurrency\n");

  const firstRun = await fixture.forge.runWorkflow("demo", workflowDefinitionId("concurrency.yml"), { actor, ref: "HEAD" });
  await waitUntilRunStarts(fixture, firstRun.id);
  const secondRun = await fixture.forge.runWorkflow("demo", workflowDefinitionId("concurrency.yml"), { actor, ref: "HEAD" });
  const firstCompleted = await waitForRun(fixture.forge, "demo", firstRun.id);
  const secondCompleted = await waitForRun(fixture.forge, "demo", secondRun.id);
  const firstEvents = await fixture.forge.listWorkflowRunEvents("demo", firstRun.id);

  expect(firstCompleted.status).toBe("cancelled");
  expect(secondCompleted.status).toBe("success");
  expect(firstEvents.some((event) => event.type === "run.cancellation_requested")).toBe(true);
  expect(firstEvents.some((event) => event.type === "run.cancelled")).toBe(true);
}, { timeout: 20_000 });

test("matches new push branch and tag filters from activity triggers", async () => {
  const fixture = await createWorkflowRepository("branch.yml", `
name: Branch Trigger
on:
  push:
    branches:
      - main
jobs:
  branch:
    runs-on: ubuntu-latest
    steps:
      - run: printf 'branch\\n'
`, "# Triggers\n");
  writeWorkflowFile(fixture.workspace, "tag.yml", `
name: Tag Trigger
on:
  push:
    tags:
      - v*
jobs:
  tag:
    runs-on: ubuntu-latest
    steps:
      - run: printf 'tag\\n'
`, ".git-host");
  await fixture.host.createTag("demo", {
    actor,
    name: "v1.2.3",
    ref: "main",
  });

  const headCommit = git(["rev-parse", "HEAD"], fixture.workspace);
  await recordPushActivity(fixture, "push-main", { branch: "main", head_commit: headCommit, ref: "main" }, "Push main");
  await recordPushActivity(fixture, "push-tag", { head_commit: headCommit, ref: "refs/tags/v1.2.3", tag_name: "v1.2.3" }, "Push tag");

  await waitForRunCount(fixture.forge, "demo", 2);
  const branchRuns = await fixture.forge.listWorkflowRuns("demo", { workflowId: workflowDefinitionId("branch.yml"), triggerKind: "push" });
  const tagRuns = await fixture.forge.listWorkflowRuns("demo", { workflowId: workflowDefinitionId("tag.yml"), triggerKind: "push" });

  expect(branchRuns).toHaveLength(1);
  expect(tagRuns).toHaveLength(1);
  expect((await waitForRun(fixture.forge, "demo", branchRuns[0]!.id)).status).toBe("success");
  expect((await waitForRun(fixture.forge, "demo", tagRuns[0]!.id)).status).toBe("success");
}, { timeout: 20_000 });

test("fails unsupported runner labels clearly", async () => {
  const fixture = createActionsFixture();

  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeWorkflowFile(fixture.workspace, "unsupported-runner.yml", `
name: Unsupported Runner
on:
  workflow_dispatch:
jobs:
  build:
    runs-on:
      - windows-latest
    steps:
      - run: printf 'never\\n'
`, ".git-host");
  writeFile(fixture.workspace, "README.md", "# Unsupported Runner\n");
  await fixture.host.ensureRepository("demo", { actor });

  const run = await fixture.forge.runWorkflow("demo", workflowDefinitionId("unsupported-runner.yml"), {
    actor,
    ref: "HEAD",
  });
  const completed = await waitForRun(fixture.forge, "demo", run.id);
  const jobs = await fixture.forge.listWorkflowRunJobs("demo", run.id);
  const steps = await fixture.forge.listWorkflowRunSteps("demo", run.id);

  expect(completed.status).toBe("failed");
  expect(completed.summary.toLowerCase()).toContain("unsupported runner");
  expect(jobs[0]?.status).toBe("failed");
  expect(steps[0]?.status).toBe("skipped");
}, { timeout: 20_000 });
