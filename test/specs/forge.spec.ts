import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";

import {
  createGitForge,
  createGitForgeApiHandler,
  createInMemoryGitForgeStorageAdapter,
} from "../../src/index.js";
import { GitApiClientProvider, createGitApiClient } from "../../src/react/index.js";
import {
  GitRepositoryForksPage,
  GitRepositoryOverviewPage,
  GitRepositoryBranchesPage,
  GitRepositoryBlamePage,
  GitRepositoryComparePage,
  GitRepositoryReleasesPage,
  GitRepositorySearchPage,
  GitRepositoryTagsPage,
} from "../../src/browser/index.js";
import {
  GitCommitList,
  GitRepositoryShell,
  GitRepositoryUiProvider,
  createGitRepositoryRouteAdapter,
} from "../../src/react/index.js";
import { closeServer, createHost, createServer, fetchJson, git, gitCommit, listen, resolveRepositoryPath, sleep, tempDir, writeFile } from "./helpers.js";

function actorHeaders(actorId = "alice") {
  return {
    "content-type": "application/json",
    "x-actor-id": actorId,
  };
}

async function waitFor(check: () => boolean, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) return;
    await act(async () => {
      await sleep(25);
    });
  }
}

describe("@trebired/git-host forge", () => {
  test("serves forge releases, social, forks, and activity over the forge API and typed client", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const host = createHost(repositoriesRoot);
    const storage = createInMemoryGitForgeStorageAdapter();
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Forge API\n");
    writeFile(workspace, "src/app.ts", "export const version = 1;\n");

    await host.ensureRepository("demo", {
      actor: { name: "Alice", email: "alice@example.com", id: "alice" },
    });
    await host.createTag("demo", {
      actor: { name: "Alice", email: "alice@example.com", id: "alice" },
      message: "Version 1",
      name: "v1",
      ref: "main",
    });

    const forge = createGitForge({
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

    const server = createServer(createGitForgeApiHandler({
      basePath: "/api/git",
      forge,
      gitHost: host,
      resolveActor(request) {
        const actorId = Array.isArray(request.headers["x-actor-id"]) ? request.headers["x-actor-id"][0] : request.headers["x-actor-id"];
        return actorId ? { id: String(actorId), name: "Alice", email: "alice@example.com" } : null;
      },
    }));
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/api/git/repositories/demo`;
    const client = createGitApiClient({
      baseUrl: `http://127.0.0.1:${port}/api/git`,
      headers: actorHeaders(),
    });

    try {
      const initialOverview = await fetchJson(`${baseUrl}/overview`, {
        headers: actorHeaders(),
      });
      expect(initialOverview.response.status).toBe(200);
      expect(initialOverview.json.data.social.star_count).toBe(0);

      const starResponse = await fetchJson(`${baseUrl}/stars`, {
        body: JSON.stringify({}),
        headers: actorHeaders(),
        method: "POST",
      });
      expect(starResponse.json.data.viewer_has_starred).toBe(true);
      expect(starResponse.json.data.star_count).toBe(1);

      const watchResponse = await fetchJson(`${baseUrl}/watch`, {
        body: JSON.stringify({}),
        headers: actorHeaders(),
        method: "POST",
      });
      expect(watchResponse.json.data.viewer_is_watching).toBe(true);
      expect(watchResponse.json.data.watcher_count).toBe(1);

      const releaseOne = await fetchJson(`${baseUrl}/releases`, {
        body: JSON.stringify({
          existingTagName: "v1",
          notes: "Initial stable release",
          title: "Version 1",
        }),
        headers: actorHeaders(),
        method: "POST",
      });
      expect(releaseOne.json.data.tag_name).toBe("v1");

      const releaseTwo = await client.createRelease("demo", {
        createTag: {
          annotatedMessage: "Version 2",
          name: "v2",
          targetRef: "main",
        },
        notes: "Created from the typed client.",
        title: "Version 2",
      });
      expect(releaseTwo.tag_name).toBe("v2");
      expect((await host.listTags("demo")).some((tag) => tag.name === "v2")).toBe(true);

      await client.deleteRelease("demo", releaseOne.json.data.id, { deleteTag: false });
      expect((await host.listTags("demo")).some((tag) => tag.name === "v1")).toBe(true);

      await client.deleteRelease("demo", releaseTwo.id, { deleteTag: true });
      expect((await host.listTags("demo")).some((tag) => tag.name === "v2")).toBe(false);

      const createdFork = await client.createFork("demo");
      expect(createdFork.fork_repository_id).toBe("demo-fork");
      expect(createdFork.fork_status.behind).toBe(0);

      writeFile(workspace, "src/app.ts", "export const version = 2;\n");
      gitCommit(workspace, "Upstream change");

      const syncedFork = await client.syncFork("demo", "demo-fork", { strategy: "ff-only" });
      expect(syncedFork.fork_status.behind).toBe(0);

      const forks = await client.listForks("demo");
      expect(forks).toHaveLength(1);
      expect(forks[0].fork_repository_id).toBe("demo-fork");

      const activity = await client.listActivity("demo");
      expect(activity.some((entry) => entry.kind === "star")).toBe(true);
      expect(activity.some((entry) => entry.kind === "fork.sync")).toBe(true);

      const overview = await client.readOverview("demo");
      expect(overview.social.star_count).toBe(1);
      expect(overview.fork_count).toBe(1);
      expect(overview.release_count).toBe(0);
    } finally {
      await closeServer(server);
      server.unref();
    }
  });

  test("rejects non-fast-forward fork syncs", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const host = createHost(repositoriesRoot);
    const storage = createInMemoryGitForgeStorageAdapter();
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Divergence\n");
    await host.ensureRepository("demo", {
      actor: { name: "Alice", email: "alice@example.com", id: "alice" },
    });

    const forge = createGitForge({
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

    await forge.createFork("demo", {
      actor: { id: "alice", name: "Alice", email: "alice@example.com" },
    });

    const forkWorkspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo-fork/workspace" });
    writeFile(forkWorkspace, "fork.txt", "fork-only\n");
    gitCommit(forkWorkspace, "Fork change");

    writeFile(workspace, "upstream.txt", "upstream-only\n");
    gitCommit(workspace, "Upstream change");

    await expect(forge.syncFork("demo-fork", {
      actor: { id: "alice", name: "Alice", email: "alice@example.com" },
      strategy: "ff-only",
    })).rejects.toMatchObject({
      code: "forge_sync_conflict",
    });
  });

  test("renders browser pages and updates visible state through forge mutations", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const host = createHost(repositoriesRoot);
    const storage = createInMemoryGitForgeStorageAdapter();
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Browser\n");
    writeFile(workspace, "src/app.ts", "export const feature = true;\n");
    await host.ensureRepository("demo", {
      actor: { name: "Alice", email: "alice@example.com", id: "alice" },
    });

    const forge = createGitForge({
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

    const server = createServer(createGitForgeApiHandler({
      basePath: "/api/git",
      forge,
      gitHost: host,
      resolveActor() {
        return { id: "alice", name: "Alice", email: "alice@example.com" };
      },
    }));
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/api/git`;

    try {
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        if (!String(args[0] || "").includes("react-test-renderer is deprecated")) {
          originalConsoleError(...args as Parameters<typeof console.error>);
        }
      };

      let overviewRenderer: ReturnType<typeof createRenderer> | null = null;
      try {
        await act(async () => {
          overviewRenderer = createRenderer(createElement(GitRepositoryOverviewPage, {
            baseUrl,
            headers: actorHeaders(),
            repositoryKey: "demo",
          }));
        });

        await waitFor(() => {
          const buttons = overviewRenderer?.root.findAll((node) => node.type === "button") || [];
          return buttons.some((node) => String(node.props.children).includes("Star"));
        });

        const starButton = overviewRenderer?.root.findAll((node) => node.type === "button").find((node) => String(node.props.children).includes("Star"));
        const watchButton = overviewRenderer?.root.findAll((node) => node.type === "button").find((node) => String(node.props.children).includes("Watch"));
        await act(async () => {
          await starButton?.props.onClick();
          await watchButton?.props.onClick();
        });

        await waitFor(() => {
          const buttons = overviewRenderer?.root.findAll((node) => node.type === "button") || [];
          return buttons.some((node) => String(node.props.children).includes("Starred 1"))
            && buttons.some((node) => String(node.props.children).includes("Watching 1"));
        });
        expect(overviewRenderer?.toJSON()).toBeTruthy();

        let releasesRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          releasesRenderer = createRenderer(createElement(GitRepositoryReleasesPage, {
            baseUrl,
            headers: actorHeaders(),
            repositoryKey: "demo",
          }));
        });

        await waitFor(() => (releasesRenderer?.root.findAll((node) => node.type === "input").length || 0) >= 2);
        const inputs = releasesRenderer?.root.findAll((node) => node.type === "input") || [];
        const textarea = releasesRenderer?.root.find((node) => node.type === "textarea");
        const form = releasesRenderer?.root.find((node) => node.type === "form");

        await act(async () => {
          inputs[0]?.props.onChange({ target: { value: "Browser Release" } });
          inputs[1]?.props.onChange({ target: { value: "browser-v1" } });
          textarea?.props.onChange({ target: { value: "Published from the browser page." } });
        });
        await act(async () => {
          await form?.props.onSubmit({ preventDefault() {} });
        });

        await waitFor(() => JSON.stringify(releasesRenderer?.toJSON()).includes("Browser Release"));
        expect(JSON.stringify(releasesRenderer?.toJSON())).toContain("Browser Release");

        let forksRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          forksRenderer = createRenderer(createElement(GitRepositoryForksPage, {
            baseUrl,
            headers: actorHeaders(),
            repositoryKey: "demo",
          }));
        });

        await waitFor(() => JSON.stringify(forksRenderer?.toJSON()).includes("Fork Network"));
        expect(JSON.stringify(forksRenderer?.toJSON())).toContain("Fork Network");

        await act(async () => {
          overviewRenderer?.unmount();
          releasesRenderer?.unmount();
          forksRenderer?.unmount();
        });
      } finally {
        console.error = originalConsoleError;
      }
    } finally {
      await closeServer(server);
      server.unref();
    }
  });

  test("supports package-owned route adapters and hybrid react repository sections", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const host = createHost(repositoriesRoot);
    const storage = createInMemoryGitForgeStorageAdapter();
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });
    const navigateCalls: string[] = [];

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Hybrid\n");
    writeFile(workspace, "src/app.ts", "export const searchable = true;\n");
    await host.ensureRepository("demo", {
      actor: { name: "Alice", email: "alice@example.com", id: "alice" },
    });
    await host.createTag("demo", {
      actor: { name: "Alice", email: "alice@example.com", id: "alice" },
      message: "Hybrid release",
      name: "v1",
      ref: "main",
    });

    const forge = createGitForge({
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

    const server = createServer(createGitForgeApiHandler({
      basePath: "/api/git",
      forge,
      gitHost: host,
      resolveActor() {
        return { id: "alice", name: "Alice", email: "alice@example.com" };
      },
    }));
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/api/git`;
    const routeAdapter = {
      ...createGitRepositoryRouteAdapter({ repositoryBasePath: "/workspaces" }),
      code(repositoryKey: string, path?: string, ref?: string) {
        return `/custom/${repositoryKey}/files${path ? `/${path}` : ""}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
      },
    };

    try {
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        if (!String(args[0] || "").includes("react-test-renderer is deprecated")) {
          originalConsoleError(...args as Parameters<typeof console.error>);
        }
      };

      try {
        let branchesRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          branchesRenderer = createRenderer(createElement(GitRepositoryBranchesPage, {
            baseUrl,
            headers: actorHeaders(),
            navigate: (to: string) => navigateCalls.push(to),
            repositoryKey: "demo",
            routeAdapter,
          }));
        });
        await waitFor(() => JSON.stringify(branchesRenderer?.toJSON()).includes("Branches"));
        const codeTab = branchesRenderer?.root.findAll((node) => node.type === "button").find((node) => node.props.children === "Code");
        await act(async () => {
          codeTab?.props.onClick();
        });
        expect(navigateCalls.some((value) => value.startsWith("/custom/demo/files"))).toBe(true);

        let tagsRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          tagsRenderer = createRenderer(createElement(GitRepositoryTagsPage, {
            baseUrl,
            headers: actorHeaders(),
            repositoryKey: "demo",
          }));
        });
        await waitFor(() => JSON.stringify(tagsRenderer?.toJSON()).includes("v1"));
        expect(JSON.stringify(tagsRenderer?.toJSON())).toContain("v1");

        let searchRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          searchRenderer = createRenderer(createElement(GitRepositorySearchPage, {
            baseUrl,
            headers: actorHeaders(),
            query: "searchable",
            repositoryKey: "demo",
          }));
        });
        await waitFor(() => JSON.stringify(searchRenderer?.toJSON()).includes("src/app.ts"));
        expect(JSON.stringify(searchRenderer?.toJSON())).toContain("src/app.ts");

        let blameRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          blameRenderer = createRenderer(createElement(GitRepositoryBlamePage, {
            baseUrl,
            headers: actorHeaders(),
            path: "README.md",
            repositoryKey: "demo",
          }));
        });
        await waitFor(() => JSON.stringify(blameRenderer?.toJSON()).includes("Alice"));
        expect(JSON.stringify(blameRenderer?.toJSON())).toContain("Alice");

        let compareRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          compareRenderer = createRenderer(createElement(GitRepositoryComparePage, {
            baseRef: "main",
            baseUrl,
            headRef: "main",
            headers: actorHeaders(),
            repositoryKey: "demo",
          }));
        });
        await waitFor(() => JSON.stringify(compareRenderer?.toJSON()).includes("Compare Summary"));
        expect(JSON.stringify(compareRenderer?.toJSON())).toContain("Compare Summary");

        const client = createGitApiClient({ baseUrl, headers: actorHeaders() });
        const commits = await client.listCommits("demo");
        let hybridRenderer: ReturnType<typeof createRenderer> | null = null;
        await act(async () => {
          hybridRenderer = createRenderer(createElement(GitApiClientProvider, {
            client,
            children: createElement(GitRepositoryUiProvider, {
              navigate: (to: string) => navigateCalls.push(to),
              routeAdapter,
              children: createElement(GitRepositoryShell, {
                page: "commits",
                repositoryKey: "demo",
                subtitle: "Hybrid host chrome",
                title: "Commits",
                children: createElement(GitCommitList, {
                  commits,
                  repositoryKey: "demo",
                }),
              }),
            }),
          }));
        });
        const commitButton = hybridRenderer?.root.findAll((node) => node.type === "button").find((node) => String(node.props.children).includes("Initial import"));
        await act(async () => {
          commitButton?.props.onClick();
        });
        expect(navigateCalls.some((value) => value.includes("/workspaces/demo/commits/"))).toBe(true);

        await act(async () => {
          branchesRenderer?.unmount();
          tagsRenderer?.unmount();
          searchRenderer?.unmount();
          blameRenderer?.unmount();
          compareRenderer?.unmount();
          hybridRenderer?.unmount();
        });
      } finally {
        console.error = originalConsoleError;
      }
    } finally {
      await closeServer(server);
      server.unref();
    }
  });

  test("supports unstyled repository shells with host-owned slot classes and render overrides", async () => {
    let renderer: ReturnType<typeof createRenderer> | null = null;

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (!String(args[0] || "").includes("react-test-renderer is deprecated")) {
        originalConsoleError(...args as Parameters<typeof console.error>);
      }
    };

    try {
      await act(async () => {
        renderer = createRenderer(createElement(GitRepositoryUiProvider, {
          components: {
            EmptyState(props) {
              return createElement("aside", {
                className: "host-empty-state",
                children: `${props.title || "Nothing"} :: ${props.message || ""}`,
              });
            },
          },
          theme: {
            classNames: {
              page: "host-page",
              title: "host-title",
            },
            slots: {
              page: {
                attributes: {
                  "data-host-shell": "true",
                },
              },
            },
            unstyled: true,
          },
          children: createElement(GitRepositoryShell, {
            empty: true,
            page: "overview",
            repositoryKey: "demo",
            title: "Demo",
          }),
        }));
      });

      const page = renderer?.root.find((node) => node.props?.["data-slot"] === "page");
      expect(String(page?.props.className || "")).toContain("host-page");
      expect(String(page?.props.className || "")).not.toContain("git-browser-page");
      expect(page?.props["data-host-shell"]).toBe("true");
      expect(JSON.stringify(renderer?.toJSON())).toContain("host-empty-state");
    } finally {
      console.error = originalConsoleError;
      await act(async () => {
        renderer?.unmount();
      });
    }
  });
});
