import { expect, test } from "bun:test";
import { Readable } from "node:stream";

import {
  createGitForge,
  createGitForgeApiHandler,
} from "#rfvjfxzebkbs";
import { closeServer, createServer, listen, resolveRepositoryPath, writeFile } from "#cx668v9vcf0v";

import { createForgeFixture } from "./fixture.js";

function registerForgeAssetLinkTest() {
  test("adds host-owned release asset download links", async () => {
    const fixture = createForgeFixture();
    writeFile(fixture.workspace, "README.md", "# Assets\n");
    await fixture.host.ensureRepository("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" } });
    await fixture.host.createTag("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" }, message: "Version 1", name: "v1", ref: "main" });
    const forge = createGitForge({
      createForkRepository({ upstreamRepositoryId }) {
        return {
          id: `${upstreamRepositoryId}-fork`,
          path: resolveRepositoryPath({ rootDir: fixture.repositoriesRoot, repositoryPath: `${upstreamRepositoryId}-fork/workspace` }),
        };
      },
      gitHost: fixture.host,
      releaseAssetStore: {
        buildAssetDownloadUrl({ asset, repositoryKey, release }) {
          return `https://downloads.example.test/${encodeURIComponent(String(repositoryKey || "demo"))}/${encodeURIComponent(release.id)}/${encodeURIComponent(asset.id)}`;
        },
      },
      storage: fixture.storage,
    });
    const server = createServer(createGitForgeApiHandler({
      basePath: "/api/git",
      forge,
      gitHost: fixture.host,
      resolveActor() {
        return { id: "alice", name: "Alice", email: "alice@example.com" };
      },
    }));
    const port = await listen(server);
    try {
      const createdRelease = await forge.createRelease("demo", {
        actor: { id: "alice", name: "Alice", email: "alice@example.com" },
        assets: [{ content_type: "application/gzip", id: "asset-1", name: "bundle.tgz", size: 123 }],
        existingTagName: "v1",
        notes: "Asset test",
        title: "Release with assets",
      });
      const response = await fetch(`http://127.0.0.1:${port}/api/git/repositories/demo/releases/${encodeURIComponent(createdRelease.id)}`, {
        headers: { "x-actor-id": "alice" },
      });
      const release = await response.json() as { data: { assets: Array<{ download?: { href?: string }; download_url?: string }> } };
      expect(release.data.assets[0]?.download?.href).toBe(`https://downloads.example.test/demo/${encodeURIComponent(createdRelease.id)}/asset-1`);
      expect(release.data.assets[0]?.download_url).toBe(`https://downloads.example.test/demo/${encodeURIComponent(createdRelease.id)}/asset-1`);
    } finally {
      await closeServer(server);
      server.unref();
    }
  });
}

function registerForgeAssetRouteTest() {
  test("serves uploaded release assets over the forge asset route", async () => {
    const fixture = createForgeFixture();
    writeFile(fixture.workspace, "README.md", "# Asset Route\n");
    await fixture.host.ensureRepository("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" } });
    await fixture.host.createTag("demo", { actor: { name: "Alice", email: "alice@example.com", id: "alice" }, message: "Version 1", name: "v1", ref: "main" });
    const forge = createForgeAssetStreamApi(fixture);
    const server = createServer(createGitForgeApiHandler({
      basePath: "/api/git",
      forge,
      gitHost: fixture.host,
      resolveActor() {
        return { id: "alice", name: "Alice", email: "alice@example.com" };
      },
    }));
    const port = await listen(server);
    try {
      const release = await forge.createRelease("demo", {
        actor: { id: "alice", name: "Alice", email: "alice@example.com" },
        assets: [{ content_type: "text/plain; charset=utf-8", id: "asset-1", name: "notes.txt", size: 12 }],
        existingTagName: "v1",
        notes: "Asset stream",
        title: "Release stream",
      });
      const response = await fetch(`http://127.0.0.1:${port}/api/git/repositories/demo/releases/${encodeURIComponent(release.id)}/assets/asset-1`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(response.headers.get("content-disposition")).toContain("notes.txt");
      expect(await response.text()).toBe("hello asset\n");
      const head = await fetch(`http://127.0.0.1:${port}/api/git/repositories/demo/releases/${encodeURIComponent(release.id)}/assets/asset-1`, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(head.headers.get("content-disposition")).toContain("notes.txt");
    } finally {
      await closeServer(server);
      server.unref();
    }
  });
}

function createForgeAssetStreamApi(fixture: ReturnType<typeof createForgeFixture>) {
  return createGitForge({
    createForkRepository({ upstreamRepositoryId }) {
      return {
        id: `${upstreamRepositoryId}-fork`,
        path: resolveRepositoryPath({ rootDir: fixture.repositoriesRoot, repositoryPath: `${upstreamRepositoryId}-fork/workspace` }),
      };
    },
    gitHost: fixture.host,
    releaseAssetStore: {
      async openAssetDownload({ asset }) {
        return {
          asset,
          content_type: "text/plain; charset=utf-8",
          file_name: asset.name,
          size: 12,
          stream: Readable.from(["hello asset\n"]),
        };
      },
    },
    storage: fixture.storage,
  });
}

export { registerForgeAssetLinkTest, registerForgeAssetRouteTest };
