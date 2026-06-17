import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";

import { createFileSystemGitArchiveCache, createGitApiHandler, createGitApiSocketServer, createGitHost } from "../../src/index.js";
import {
  createGitApiClient,
  GitApiClientProvider,
  useGitBlame,
  useGitCommits,
  useGitLinguist,
  useGitRepositorySummary,
  useGitSearch,
  useGitTags,
  useGitTree,
} from "../../src/react/index.js";
import { createHost, createServer, fetchJson, listen, resolveRepositoryPath, sleep, tempDir, writeFile } from "./helpers.js";
import { captureLogger } from "./helpers.js";

describe("@trebired/git-host", () => {
  test("serves summary, branches, commits, tree, blob, and diff over the JSON API", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
    const actor = { name: "Alice", email: "alice@example.com" };

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# API\n");
    writeFile(workspace, "data.json", "{\n  \"value\": true\n}\n");
    writeFile(workspace, "src/app.ts", "export const value = 1;\n");
    fs.writeFileSync(path.join(workspace, "logo.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const initialSummary = await host.ensureRepository("demo", { actor });
    await host.createBranch("demo", { name: "feature/api", checkout: true });
    writeFile(workspace, "src/app.ts", "export const value = 2;\n");
    writeFile(workspace, "src/extra.ts", "export const extra = true;\n");
    await host.commit("demo", { actor, message: "API feature update" }).catch(async () => {
      await host.stagePaths("demo");
      await host.commit("demo", { actor, message: "API feature update" });
    });
    await host.checkoutBranch("demo", { name: "main" });
    await host.createTag("demo", {
      actor,
      message: "API release",
      name: "v1",
      ref: "main",
    });

    const server = createServer(createGitApiHandler({ basePath: "/api/git", gitHost: host }));
    const socketServer = createGitApiSocketServer({ basePath: "/api/git", gitHost: host, httpServer: server });
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/api/git/repositories/demo`;

    try {
      expect((await fetchJson(`${baseUrl}/summary`)).response.status).toBe(200);
      expect((await fetchJson(`${baseUrl}/branches`)).json.data.some((entry: any) => entry.name === "feature/api")).toBe(true);
      expect((await fetchJson(`${baseUrl}/commits?limit=1`)).json.data).toHaveLength(1);
      expect((await fetchJson(`${baseUrl}/commits?ref=main&path=README.md`)).json.data[0].subject).toBe("Initial import");
      expect((await fetchJson(`${baseUrl}/commits/${encodeURIComponent(initialSummary.repository.head_commit)}`)).json.action).toBe("commit");
      expect((await fetchJson(`${baseUrl}/tags`)).json.data.some((entry: any) => entry.name === "v1")).toBe(true);
      expect((await fetchJson(`${baseUrl}/tags/v1`)).json.data.message).toBe("API release");
      expect((await fetchJson(`${baseUrl}/tree?path=src`)).json.data.some((entry: any) => entry.path === "src/app.ts")).toBe(true);
      expect((await fetchJson(`${baseUrl}/blame?ref=main&path=README.md`)).json.data.lines[0].content).toBe("# API");
      expect((await fetchJson(`${baseUrl}/search?ref=main&path=src&query=value`)).json.data.match_count).toBe(1);
      expect((await fetchJson(`${baseUrl}/archive?ref=main&format=zip`)).json.data.file_name.endsWith(".zip")).toBe(true);
      expect((await fetchJson(`${baseUrl}/blob?path=README.md`)).json.data.content).toBe("# API\n");
      expect((await fetchJson(`${baseUrl}/diff?baseRef=main&headRef=${encodeURIComponent("feature/api")}`)).json.data.commit_count).toBe(1);
      expect((await fetchJson(`${baseUrl}/diff?baseRef=main&headRef=${encodeURIComponent("feature/api")}&path=src`)).json.data.files.every((entry: any) => String(entry.path).startsWith("src/"))).toBe(true);
      expect((await fetchJson(`${baseUrl}/linguist?ref=main`)).json.data.files.results["src/app.ts"]).toBe("TypeScript");
      expect((await fetchJson(`${baseUrl}/linguist?ref=main`)).json.data.files.results["logo.png"]).toBeUndefined();
      const treeResponse = await fetchJson(`${baseUrl}/tree?ref=main&recursive=true&linguist=true&icons=true`);
      expect(treeResponse.json.data.find((entry: any) => entry.path === "src/app.ts").language).toBe("TypeScript");
      expect(treeResponse.json.data.find((entry: any) => entry.path === "src/app.ts").icon.svg.includes("<svg")).toBe(true);
    } finally {
      socketServer.disconnectSockets(true);
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      try {
        server.close();
      } catch {}
      server.unref();
    }
  });

  test("provides a typed React client for the JSON API", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
    const actor = { name: "Alice", email: "alice@example.com" };

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# React API\n");
    writeFile(workspace, "data.json", "{\n  \"value\": true\n}\n");
    writeFile(workspace, "src/app.ts", "export const value = 1;\n");
    fs.writeFileSync(path.join(workspace, "logo.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await host.ensureRepository("demo", { actor });
    await host.createTag("demo", {
      actor,
      message: "Client release",
      name: "v1",
      ref: "main",
    });

    const server = createServer(createGitApiHandler({ basePath: "/api/git", gitHost: host }));
    const socketServer = createGitApiSocketServer({ basePath: "/api/git", gitHost: host, httpServer: server });
    const port = await listen(server);
    const client = createGitApiClient({ baseUrl: `http://127.0.0.1:${port}/api/git` });
    const progressStages: string[] = [];
    let streamedLanguage = "";

    try {
      expect((await client.readSummary("demo")).repository.current_branch).toBe("main");
      expect((await client.listBranches("demo")).some((entry) => entry.name === "main")).toBe(true);
      expect((await client.listCommits("demo", { path: "README.md", ref: "main" }))[0].subject).toBe("Initial import");
      expect((await client.listTags("demo")).some((entry) => entry.name === "v1")).toBe(true);
      expect((await client.readTag("demo", "v1")).message).toBe("Client release");
      expect((await client.readBlame("demo", { path: "README.md", ref: "main" })).lines[0].author_name).toBe("Alice");
      expect((await client.search("demo", { path: "src", query: "value", ref: "main" })).match_count).toBe(1);
      expect((await client.readArchive("demo", { format: "zip", ref: "main" })).file_name.endsWith(".zip")).toBe(true);
      expect((await client.readBlob("demo", { path: "README.md" })).content).toBe("# React API\n");
      expect((await client.diff("demo", { baseRef: "main", headRef: "main", path: "src" })).files).toHaveLength(0);
      expect((await client.readLinguist("demo", { ref: "main" })).files.results["data.json"]).toBe("JSON");
      expect((await client.listTree("demo", { icons: true, linguist: true, recursive: true, ref: "main" })).find((entry) => entry.path === "README.md")?.icon?.name).toBe("readme");
      const socket = client.openLinguistSocket("demo", {
        onProgress(event) {
          progressStages.push(event.stage);
        },
        onResult(event) {
          streamedLanguage = String(event.data.files.results["data.json"] || "");
        },
        ref: "main",
      });
      await socket.completed;
      expect(progressStages).toContain("reading_blobs");
      expect(progressStages[progressStages.length - 1]).toBe("completed");
      expect(streamedLanguage).toBe("JSON");
    } finally {
      socketServer.disconnectSockets(true);
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      try {
        server.close();
      } catch {}
      server.unref();
    }
  });

  test("provides React hooks over the JSON API", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
    const snapshots: Array<{
      branch: string | null;
      blameLines: number;
      commitCount: number;
      hasReadmeIcon: boolean;
      loading: boolean;
      searchMatches: number;
      tagCount: number;
      treeLanguage: string | null;
      typescriptCount: number;
    }> = [];

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# React Hooks\n");
    writeFile(workspace, "src/app.ts", "export const value = 1;\n");
    await host.ensureRepository("demo");
    await host.createTag("demo", {
      actor: { name: "Alice", email: "alice@example.com" },
      message: "Hooks release",
      name: "v1",
      ref: "main",
    });

    const server = createServer(createGitApiHandler({ basePath: "/api/git", gitHost: host }));
    const socketServer = createGitApiSocketServer({ basePath: "/api/git", gitHost: host, httpServer: server });
    const port = await listen(server);
    const client = createGitApiClient({ baseUrl: `http://127.0.0.1:${port}/api/git` });
    const hasLoadedSnapshot = () => (
      snapshots.some((entry) => (
        entry.loading === false
        && entry.branch === "main"
        && entry.commitCount === 1
        && entry.tagCount === 1
        && entry.blameLines === 1
        && entry.searchMatches === 1
        && entry.typescriptCount === 1
        && entry.treeLanguage === "TypeScript"
        && entry.hasReadmeIcon
      ))
    );

    async function waitForLoadedSnapshot() {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (hasLoadedSnapshot()) return;
        await act(async () => {
          await sleep(25);
        });
      }
    }

    function Probe() {
      const summary = useGitRepositorySummary("demo");
      const commits = useGitCommits("demo", { path: "README.md", ref: "main" });
      const tags = useGitTags("demo");
      const blame = useGitBlame("demo", { path: "README.md", ref: "main" });
      const linguist = useGitLinguist("demo", { ref: "main" });
      const search = useGitSearch("demo", { path: "src", query: "value", ref: "main" });
      const tree = useGitTree("demo", { icons: true, linguist: true, recursive: true, ref: "main" });
      snapshots.push({
        branch: summary.data ? summary.data.repository.current_branch : null,
        blameLines: blame.data ? blame.data.lines.length : 0,
        commitCount: commits.data ? commits.data.length : 0,
        hasReadmeIcon: Boolean(tree.data && tree.data.find((entry) => entry.path === "README.md")?.icon?.name === "readme"),
        loading: summary.loading || commits.loading || tags.loading || blame.loading || linguist.loading || search.loading || tree.loading,
        searchMatches: search.data ? search.data.match_count : 0,
        tagCount: tags.data ? tags.data.length : 0,
        treeLanguage: tree.data ? tree.data.find((entry) => entry.path === "src/app.ts")?.language || null : null,
        typescriptCount: linguist.data && linguist.data.languages.results.TypeScript ? linguist.data.languages.results.TypeScript.count : 0,
      });
      return null;
    }

    try {
      let renderer: ReturnType<typeof createRenderer> | null = null;
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        if (!String(args[0] || "").includes("react-test-renderer is deprecated")) {
          originalConsoleError(...args as Parameters<typeof console.error>);
        }
      };

      try {
        await act(async () => {
          renderer = createRenderer(createElement(GitApiClientProvider, { client }, createElement(Probe)));
        });
        await waitForLoadedSnapshot();
        expect(hasLoadedSnapshot()).toBe(true);
        await act(async () => { renderer?.unmount(); });
      } finally {
        console.error = originalConsoleError;
      }
    } finally {
      socketServer.disconnectSockets(true);
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      try {
        server.close();
      } catch {}
      server.unref();
    }
  });

  test("streams zipball and tarball downloads with auth, headers, and cache reuse", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const cacheRoot = path.join(root, "archive-cache");
    const { logger, rows } = captureLogger();
    const host = createGitHost({
      archive: {
        cache: createFileSystemGitArchiveCache({ rootDir: cacheRoot }),
      },
      logger,
      resolveRepository(repositoryId) {
        return {
          id: repositoryId,
          path: resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: `${repositoryId}/workspace` }),
        };
      },
      verbose: true,
    });
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "private/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Private Archive\n");
    await host.ensureRepository("private", {
      actor: { name: "Alice", email: "alice@example.com" },
    });

    const server = createServer(createGitApiHandler({
      authorize({ action, request }) {
        if (action === "tarball" || action === "zipball") {
          return request.headers["x-auth"] === "allowed";
        }
        return true;
      },
      basePath: "/api/git",
      gitHost: host,
      logger,
    }));
    const socketServer = createGitApiSocketServer({ basePath: "/api/git", gitHost: host, httpServer: server });
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/api/git/repositories/private`;

    try {
      const denied = await fetchJson(`${baseUrl}/zipball/main`);
      expect(denied.response.status).toBe(403);
      expect(denied.json.error.code).toBe("permission_denied");

      const firstZip = await fetch(`${baseUrl}/zipball/main`, {
        headers: { "x-auth": "allowed" },
      });
      const firstZipBody = Buffer.from(await firstZip.arrayBuffer());
      expect(firstZip.status).toBe(200);
      expect(firstZip.headers.get("content-type")).toBe("application/zip");
      expect(firstZip.headers.get("x-git-host-archive-cache")).toBe("miss");
      expect(firstZip.headers.get("x-git-host-archive-commit")).toBeTruthy();
      expect(firstZipBody.subarray(0, 2).toString("utf8")).toBe("PK");

      const secondZip = await fetch(`${baseUrl}/zipball/main`, {
        headers: { "x-auth": "allowed" },
      });
      const secondZipBody = Buffer.from(await secondZip.arrayBuffer());
      expect(secondZip.status).toBe(200);
      expect(secondZip.headers.get("x-git-host-archive-cache")).toBe("hit");
      expect(secondZipBody.equals(firstZipBody)).toBe(true);

      const tarball = await fetch(`${baseUrl}/tarball/main`, {
        headers: { "x-auth": "allowed" },
      });
      expect(tarball.status).toBe(200);
      expect(tarball.headers.get("content-type")).toBe("application/gzip");
      expect(tarball.headers.get("content-disposition")?.includes(".tar.gz")).toBe(true);

      expect(rows.some((entry) => entry.message === "archive download denied")).toBe(true);
      expect(rows.some((entry) => entry.message === "archive download authorized")).toBe(true);
      expect(rows.some((entry) => entry.message === "archive cache hit")).toBe(true);
    } finally {
      socketServer.disconnectSockets(true);
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      try {
        server.close();
      } catch {}
      server.unref();
    }
  });
});
