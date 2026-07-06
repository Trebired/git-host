import { expect, test } from "bun:test";

import { closeServer, fetchJson, gitCommit, listen, resolveRepositoryPath, writeFile } from "#cx668v9vcf0v";

import { actorHeaders, createForgeFixture, createForgeServer } from "./fixture.js";

function registerForgeApiCoverageTest() {
  test("serves forge releases, social, forks, and activity over the forge API", async () => {
    const fixture = createForgeFixture();
    writeFile(fixture.workspace, "README.md", "# Forge API\n");
    writeFile(fixture.workspace, "src/app.ts", "export const version = 1;\n");
    await fixture.host.ensureRepository("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" } });
    await fixture.host.createTag("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" }, message: "Version 1", name: "v1", ref: "main" });
    const server = createForgeServer(fixture.forge, fixture.host);
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/api/git/repositories/demo`;
    try {
      await expectForgeOverviewFlow(baseUrl);
      await expectForgeReleaseFlow(fixture, baseUrl, port);
      await expectForgeForkFlow(fixture);
    } finally {
      await closeServer(server);
      server.unref();
    }
  });
}

async function expectForgeOverviewFlow(baseUrl: string) {
  const initialOverview = await fetchJson(`${baseUrl}/overview`, { headers: actorHeaders() });
  expect(initialOverview.response.status).toBe(200);
  expect(initialOverview.json.data.social.star_count).toBe(0);
  const starResponse = await fetchJson(`${baseUrl}/stars`, { body: JSON.stringify({}), headers: actorHeaders(), method: "POST" });
  expect(starResponse.json.data.viewer_has_starred).toBe(true);
  expect(starResponse.json.data.star_count).toBe(1);
  const watchResponse = await fetchJson(`${baseUrl}/watch`, { body: JSON.stringify({}), headers: actorHeaders(), method: "POST" });
  expect(watchResponse.json.data.viewer_is_watching).toBe(true);
  expect(watchResponse.json.data.watcher_count).toBe(1);
}

async function expectForgeReleaseFlow(
  fixture: ReturnType<typeof createForgeFixture>,
  baseUrl: string,
  port: number,
) {
  const releaseOne = await fetchJson(`${baseUrl}/releases`, {
    body: JSON.stringify({ existingTagName: "v1", notes: "Initial stable release", title: "Version 1" }),
    headers: actorHeaders(),
    method: "POST",
  });
  expect(releaseOne.json.data.tag_name).toBe("v1");
  expect(releaseOne.json.data.source_archives.zip.href.endsWith("/zipball/v1")).toBe(true);
  expect(releaseOne.json.data.source_archives.tar_gz.href.endsWith("/tarball/v1")).toBe(true);
  const releaseTwoCreated = await fixture.forge.createRelease("demo", {
    actor: { id: "alice", name: "Alice", email: "alice@example.com" },
    createTag: { annotatedMessage: "Version 2", name: "v2", targetRef: "main" },
    notes: "Created from the backend forge API.",
    title: "Version 2",
  });
  const releaseTwo = await fetchJson(`${baseUrl}/releases/${encodeURIComponent(releaseTwoCreated.id)}`, { headers: actorHeaders() });
  expect(releaseTwo.json.data.tag_name).toBe("v2");
  expect(releaseTwo.json.data.source_archives.zip.href.endsWith("/zipball/v2")).toBe(true);
  expect((await fixture.host.listTags("demo")).some((tag) => tag.name === "v2")).toBe(true);
  const releases = await fetchJson(`${baseUrl}/releases`, { headers: actorHeaders() });
  expect(releases.json.data.every((release: any) => Boolean(release.source_archives?.zip.href && release.source_archives?.tar_gz.href))).toBe(true);
  const releaseZip = await fetch(`http://127.0.0.1:${port}${releaseOne.json.data.source_archives.zip.href}`);
  expect(releaseZip.status).toBe(200);
  expect(releaseZip.headers.get("content-type")).toBe("application/zip");
  const tags = await fetchJson(`${baseUrl}/tags`);
  expect(tags.json.data.find((entry: any) => entry.name === "v1").source_archives.zip.href.endsWith("/zipball/v1")).toBe(true);
  await fixture.forge.deleteRelease("demo", releaseOne.json.data.id, { actor: { id: "alice", name: "Alice", email: "alice@example.com" }, deleteTag: false });
  expect((await fixture.host.listTags("demo")).some((tag) => tag.name === "v1")).toBe(true);
  await fixture.forge.deleteRelease("demo", releaseTwoCreated.id, { actor: { id: "alice", name: "Alice", email: "alice@example.com" }, deleteTag: true });
  expect((await fixture.host.listTags("demo")).some((tag) => tag.name === "v2")).toBe(false);
}

async function expectForgeForkFlow(fixture: ReturnType<typeof createForgeFixture>) {
  const createdFork = await fixture.forge.createFork("demo", { actor: { id: "alice", name: "Alice", email: "alice@example.com" } });
  expect(createdFork.fork_repository_id).toBe("demo-fork");
  expect(createdFork.fork_status.behind).toBe(0);
  writeFile(fixture.workspace, "src/app.ts", "export const version = 2;\n");
  gitCommit(fixture.workspace, "Upstream change");
  const syncedFork = await fixture.forge.syncFork("demo-fork", { actor: { id: "alice", name: "Alice", email: "alice@example.com" }, strategy: "ff-only" });
  expect(syncedFork.fork_status.behind).toBe(0);
  const forks = await fixture.forge.listForks("demo");
  expect(forks).toHaveLength(1);
  expect(forks[0].fork_repository_id).toBe("demo-fork");
  const activity = await fixture.forge.listActivity("demo");
  expect(activity.some((entry) => entry.kind === "star")).toBe(true);
  expect(activity.some((entry) => entry.kind === "fork.sync")).toBe(true);
  const overview = await fixture.forge.readOverview("demo", { actorId: "alice" });
  expect(overview.social.star_count).toBe(1);
  expect(overview.fork_count).toBe(1);
  expect(overview.release_count).toBe(0);
}

function registerForgeApiSyncConflictTest() {
  test("rejects non-fast-forward fork syncs", async () => {
    const fixture = createForgeFixture();
    writeFile(fixture.workspace, "README.md", "# Divergence\n");
    await fixture.host.ensureRepository("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" } });
    await fixture.forge.createFork("demo", { actor: { id: "alice", name: "Alice", email: "alice@example.com" } });
    const forkWorkspace = resolveRepositoryPath({ rootDir: fixture.repositoriesRoot, repositoryPath: "demo-fork/workspace" });
    writeFile(forkWorkspace, "fork.txt", "fork-only\n");
    gitCommit(forkWorkspace, "Fork change");
    writeFile(fixture.workspace, "upstream.txt", "upstream-only\n");
    gitCommit(fixture.workspace, "Upstream change");
    await expect(fixture.forge.syncFork("demo-fork", {
      actor: { id: "alice", name: "Alice", email: "alice@example.com" },
      strategy: "ff-only",
    })).rejects.toMatchObject({ code: "forge_sync_conflict" });
  });
}

function registerForgeApiMissingTagTest() {
  test("returns release_tag_not_found when a release points at a missing tag", async () => {
    const fixture = createForgeFixture();
    writeFile(fixture.workspace, "README.md", "# Missing Tag\n");
    await fixture.host.ensureRepository("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" } });
    await fixture.storage.releases.createRelease({
      assets: [],
      author_id: "alice",
      created_at: new Date().toISOString(),
      draft: false,
      id: "broken-release",
      notes: "Broken tag pointer",
      prerelease: false,
      published_at: new Date().toISOString(),
      repository_id: "demo",
      tag_name: "missing-tag",
      target_ref: "missing-tag",
      title: "Broken Release",
      updated_at: new Date().toISOString(),
    });
    const server = createForgeServer(fixture.forge, fixture.host);
    const port = await listen(server);
    try {
      const response = await fetchJson(`http://127.0.0.1:${port}/api/git/repositories/demo/releases/broken-release`);
      expect(response.response.status).toBe(404);
      expect(response.json.error.code).toBe("release_tag_not_found");
    } finally {
      await closeServer(server);
      server.unref();
    }
  });
}

export {
  registerForgeApiCoverageTest,
  registerForgeApiMissingTagTest,
  registerForgeApiSyncConflictTest,
};
