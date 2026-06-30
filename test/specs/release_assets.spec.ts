import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  createGitForge,
  createGitHost,
  createInMemoryGitForgeStorageAdapter,
  resolveRepositoryPath,
} from "#rfvjfxzebkbs";
import type { CreateGitForgeActionsOptions } from "#1mbdfxwwqqpa";
import { git, gitCommit, sleep, tempDir, writeFile } from "./helpers.js";

// These fixtures stand in for a multi-binary product like Operlorn (a platform
// service + a separate agent service, each published as per-OS archives on a
// release) without touching any real Operlorn source — every repo, workflow, and
// "binary" here is throwaway content invented for this test file.

const actor = {
  email: "alice@example.com",
  id: "alice",
  name: "Alice",
};

function createHost(rootDir: string) {
  return createGitHost({
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({ rootDir, repositoryPath: `${repositoryId}/workspace` }),
      };
    },
  });
}

function createActionsForge(
  repositoriesRoot: string,
  host: ReturnType<typeof createHost>,
  storage: ReturnType<typeof createInMemoryGitForgeStorageAdapter>,
  actions: CreateGitForgeActionsOptions = {},
) {
  return createGitForge({
    actions: {
      heartbeatIntervalMs: 50,
      releaseAssetsRoot: path.join(repositoriesRoot, ".release-assets"),
      workspaceRoot: path.join(repositoriesRoot, ".actions"),
      ...actions,
    },
    createForkRepository({ upstreamRepositoryId }) {
      return {
        id: `${upstreamRepositoryId}-fork`,
        path: resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: `${upstreamRepositoryId}-fork/workspace` }),
      };
    },
    gitHost: host,
    storage,
  });
}

function writeWorkflowFile(workspace: string, fileName: string, content: string) {
  writeFile(workspace, `.git-host/workflows/${fileName}`, `${content.trim()}\n`);
}

async function waitForRun(forge: ReturnType<typeof createActionsForge>, repositoryId: string, runId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await forge.readWorkflowRun(repositoryId, runId);
    if (["cancelled", "failed", "skipped", "success"].includes(run.status)) return run;
    await sleep(25);
  }
  throw new Error(`Workflow run "${runId}" did not reach a terminal status.`);
}

function tarGzEntries(archivePath: string) {
  const result = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "tar -tzf failed");
  return result.stdout.split("\n").filter(Boolean);
}

function zipEntries(archivePath: string) {
  const result = spawnSync("unzip", ["-l", archivePath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "unzip -l failed");
  return result.stdout;
}

describe("@trebired/git-host release asset publishing", () => {
  test("compresses build matrix artifacts and attaches them to an existing release as real downloadable files", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHost(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo-product/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeWorkflowFile(workspace, "release.yml", `
name: Release dummy product binaries
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        component: [server-svc, worker-svc]
    steps:
      - name: Pretend to build a binary
        run: |
          mkdir -p out/bin
          printf 'fake binary for %s\\n' "\${{ matrix.component }}" > out/bin/\${{ matrix.component }}
          printf 'build metadata\\n' > out/bin/BUILD_INFO
      - uses: actions/upload-artifact@v4
        with:
          name: build-\${{ matrix.component }}
          path: out
  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-server-svc
          path: gathered/server
      - uses: actions/publish-release-asset@v1
        with:
          name: demo-product-server-svc-linux-x64
          path: gathered/server
          format: tar.gz
          tag: v1.0.0
      - uses: actions/download-artifact@v4
        with:
          name: build-worker-svc
          path: gathered/worker
      - uses: actions/publish-release-asset@v1
        with:
          name: demo-product-worker-svc-linux-x64
          path: gathered/worker
          format: zip
          tag: v1.0.0
`);
    writeFile(workspace, "README.md", "# Demo product\n");
    await host.ensureRepository("demo-product", { actor });
    git(["tag", "v1.0.0"], workspace);

    const release = await forge.createRelease("demo-product", {
      actor,
      existingTagName: "v1.0.0",
      notes: "First release",
      title: "v1.0.0",
    });

    const run = await forge.runWorkflow("demo-product", ".git-host/workflows/release.yml", { actor, ref: "HEAD" });
    const completed = await waitForRun(forge, "demo-product", run.id);
    expect(completed.status).toBe("success");

    const events = await forge.listWorkflowRunEvents("demo-product", run.id);
    const publishEvents = events.filter((event) => event.type === "release_asset.published");
    expect(publishEvents).toHaveLength(2);
    expect(publishEvents.map((event) => event.metadata?.asset_name).sort()).toEqual([
      "demo-product-server-svc-linux-x64.tar.gz",
      "demo-product-worker-svc-linux-x64.zip",
    ]);

    const updatedRelease = await forge.readRelease("demo-product", release.id);
    expect(updatedRelease.assets).toHaveLength(2);

    const tarAsset = updatedRelease.assets.find((asset) => asset.name.endsWith(".tar.gz"));
    const zipAsset = updatedRelease.assets.find((asset) => asset.name.endsWith(".zip"));
    expect(tarAsset?.storage_pointer).toBeTruthy();
    expect(zipAsset?.storage_pointer).toBeTruthy();
    expect(tarAsset?.content_type).toBe("application/gzip");
    expect(zipAsset?.content_type).toBe("application/zip");
    expect(Number(tarAsset?.size)).toBeGreaterThan(0);
    expect(Number(zipAsset?.size)).toBeGreaterThan(0);

    const tarEntries = tarGzEntries(String(tarAsset?.storage_pointer));
    expect(tarEntries.some((entry) => entry.endsWith("server-svc"))).toBe(true);
    expect(tarEntries.some((entry) => entry.endsWith("BUILD_INFO"))).toBe(true);

    const zipListing = zipEntries(String(zipAsset?.storage_pointer));
    expect(zipListing).toContain("worker-svc");
    expect(zipListing).toContain("BUILD_INFO");
  }, { timeout: 20_000 });

  test("derives the release tag from the run ref when with.tag is omitted", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHost(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "tagged-product/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeWorkflowFile(workspace, "release.yml", `
name: Release on tag
on:
  workflow_dispatch:
  push:
    tags: [v*]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Write binary
        run: |
          mkdir -p out
          printf 'fake binary\\n' > out/tool
      - uses: actions/publish-release-asset@v1
        with:
          name: tool-linux-x64
          path: out
          format: tar.gz
`);
    writeFile(workspace, "README.md", "# Tagged product\n");
    await host.ensureRepository("tagged-product", { actor });
    git(["tag", "v2.5.0"], workspace);

    await forge.createRelease("tagged-product", {
      actor,
      existingTagName: "v2.5.0",
      notes: "",
      title: "v2.5.0",
    });

    const run = await forge.runWorkflow("tagged-product", ".git-host/workflows/release.yml", {
      actor,
      ref: "refs/tags/v2.5.0",
    });
    const completed = await waitForRun(forge, "tagged-product", run.id);
    expect(completed.status).toBe("success");

    const releases = await forge.listReleases("tagged-product");
    const release = releases.find((entry) => entry.tag_name === "v2.5.0");
    expect(release?.assets).toHaveLength(1);
    expect(release?.assets[0]?.name).toBe("tool-linux-x64.tar.gz");
  }, { timeout: 20_000 });

  test("fails clearly when no release exists yet for the target tag", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const host = createHost(repositoriesRoot);
    const forge = createActionsForge(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "no-release-product/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeWorkflowFile(workspace, "release.yml", `
name: Release without a prior release record
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Write binary
        run: |
          mkdir -p out
          printf 'fake binary\\n' > out/tool
      - uses: actions/publish-release-asset@v1
        with:
          name: tool-linux-x64
          path: out
          format: tar.gz
          tag: v9.9.9
`);
    writeFile(workspace, "README.md", "# No release product\n");
    await host.ensureRepository("no-release-product", { actor });

    const run = await forge.runWorkflow("no-release-product", ".git-host/workflows/release.yml", { actor, ref: "HEAD" });
    const completed = await waitForRun(forge, "no-release-product", run.id);
    expect(completed.status).toBe("failed");

    const steps = await forge.listWorkflowRunSteps("no-release-product", run.id);
    const failedStep = steps.find((step) => step.status === "failed");
    expect(failedStep).toBeTruthy();
    const events = await forge.listWorkflowRunEvents("no-release-product", run.id);
    expect(events.some((event) => String(event.summary || "").toLowerCase().includes("no release exists"))).toBe(true);
  }, { timeout: 20_000 });
});
