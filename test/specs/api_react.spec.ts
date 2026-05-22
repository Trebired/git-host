import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";

import { createGitApiHandler } from "../../src/index.js";
import { createGitApiClient, GitApiClientProvider, useGitRepositorySummary } from "../../src/react/index.js";
import { closeServer, createHost, createServer, fetchJson, listen, resolveRepositoryPath, sleep, tempDir, writeFile } from "./helpers.js";

describe("@trebired/git-host", () => {
  test("serves summary, branches, commits, tree, blob, and diff over the JSON API", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# API\n");
    writeFile(workspace, "src/app.ts", "export const value = 1;\n");

    const initialSummary = await host.ensureRepository("demo");
    await host.createBranch("demo", { name: "feature/api", checkout: true });
    writeFile(workspace, "src/app.ts", "export const value = 2;\n");
    writeFile(workspace, "src/extra.ts", "export const extra = true;\n");
    await host.commit("demo", { message: "API feature update" }).catch(async () => {
      await host.stagePaths("demo");
      await host.commit("demo", { message: "API feature update" });
    });
    await host.checkoutBranch("demo", { name: "main" });

    const server = createServer(createGitApiHandler({ basePath: "/api/git", gitHost: host }));
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/api/git/repositories/demo`;

    try {
      expect((await fetchJson(`${baseUrl}/summary`)).response.status).toBe(200);
      expect((await fetchJson(`${baseUrl}/branches`)).json.data.some((entry: any) => entry.name === "feature/api")).toBe(true);
      expect((await fetchJson(`${baseUrl}/commits?limit=1`)).json.data).toHaveLength(1);
      expect((await fetchJson(`${baseUrl}/commits/${encodeURIComponent(initialSummary.repository.head_commit)}`)).json.action).toBe("commit");
      expect((await fetchJson(`${baseUrl}/tree?path=src`)).json.data.some((entry: any) => entry.path === "src/app.ts")).toBe(true);
      expect((await fetchJson(`${baseUrl}/blob?path=README.md`)).json.data.content).toBe("# API\n");
      expect((await fetchJson(`${baseUrl}/diff?baseRef=main&headRef=${encodeURIComponent("feature/api")}`)).json.data.commit_count).toBe(1);
    } finally {
      await closeServer(server);
    }
  });

  test("provides a typed React client for the JSON API", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# React API\n");
    await host.ensureRepository("demo");

    const server = createServer(createGitApiHandler({ basePath: "/api/git", gitHost: host }));
    const port = await listen(server);
    const client = createGitApiClient({ baseUrl: `http://127.0.0.1:${port}/api/git` });

    try {
      expect((await client.readSummary("demo")).repository.current_branch).toBe("main");
      expect((await client.listBranches("demo")).some((entry) => entry.name === "main")).toBe(true);
      expect((await client.readBlob("demo", { path: "README.md" })).content).toBe("# React API\n");
    } finally {
      await closeServer(server);
    }
  });

  test("provides React hooks over the JSON API", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
    const snapshots: Array<{ branch: string | null; loading: boolean }> = [];

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# React Hooks\n");
    await host.ensureRepository("demo");

    const server = createServer(createGitApiHandler({ basePath: "/api/git", gitHost: host }));
    const port = await listen(server);
    const client = createGitApiClient({ baseUrl: `http://127.0.0.1:${port}/api/git` });

    function Probe() {
      const summary = useGitRepositorySummary("demo");
      snapshots.push({ branch: summary.data ? summary.data.repository.current_branch : null, loading: summary.loading });
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
        await act(async () => { await sleep(50); });
        expect(snapshots.some((entry) => entry.loading === false && entry.branch === "main")).toBe(true);
        await act(async () => { renderer?.unmount(); });
      } finally {
        console.error = originalConsoleError;
      }
    } finally {
      await closeServer(server);
    }
  });
});
