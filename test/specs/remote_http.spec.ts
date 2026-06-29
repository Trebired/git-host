import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { createGitHttpHandler } from "#rfvjfxzebkbs";
import {
  basicAuthHeader,
  closeServer,
  createHost,
  createServer,
  git,
  gitAsync,
  gitCommit,
  gitResult,
  listen,
  resolveRepositoryPath,
  tempDir,
  writeFile,
} from "./helpers.js";

describe("@trebired/git-host", () => {
  test("clones, pushes, fetches, and pulls against an authenticated smart HTTP remote", async () => {
    const root = tempDir();
    const username = "alice";
    const password = "secret";
    const authHeader = basicAuthHeader(username, password);

    const remoteHost = createHost(path.join(root, "remote-repos"));
    const remoteWorkspace = resolveRepositoryPath({ rootDir: path.join(root, "remote-repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(remoteWorkspace, { recursive: true });
    writeFile(remoteWorkspace, "README.md", "# Private\n");
    await remoteHost.ensureRepository("demo");

    const server = createServer(createGitHttpHandler({
      basePath: "/git",
      authenticate({ request }) {
        return String(request.headers.authorization || "") === authHeader ? { remoteUser: username } : null;
      },
      authorize({ remoteUser }) {
        if (remoteUser !== username) {
          return {
            allowed: false,
            headers: { "www-authenticate": 'Basic realm="git-host"' },
            message: "Auth required.",
            status: 401,
          };
        }
        return true;
      },
      resolveRepository(repositoryKey) {
        return repositoryKey === "demo" ? { id: "demo", path: remoteWorkspace } : null;
      },
    }));

    const port = await listen(server);
    const remoteUrl = `http://127.0.0.1:${port}/git/demo.git`;
    const externalCloneUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/git/demo.git`;
    const clientHost = createHost(path.join(root, "client-repos"));
    const clientWorkspace = resolveRepositoryPath({ rootDir: path.join(root, "client-repos"), repositoryPath: "client/workspace" });

    try {
      await clientHost.ensureRepository("client", {
        cloneUrl: remoteUrl,
        remoteCredentials: { password, username },
        remoteUrl,
      });

      writeFile(clientWorkspace, "README.md", "# Private v2\n");
      await clientHost.stagePaths("client");
      await clientHost.commit("client", { message: "Authenticated update" });
      await clientHost.push("client", { remoteCredentials: { password, username } });
      expect((await remoteHost.readSummary("demo")).commits[0].subject).toBe("Authenticated update");

      const externalClone = path.join(root, "external-auth");
      await gitAsync(["clone", externalCloneUrl, externalClone]);
      writeFile(externalClone, "README.md", "# Private v3\n");
      gitCommit(externalClone, "External auth update");
      await gitAsync(["push", "origin", "main"], externalClone);

      await clientHost.fetch("client", { remoteCredentials: { password, username } });
      expect((await clientHost.diff("client", { baseRef: "main", headRef: "origin/main" })).commits[0].subject).toBe("External auth update");

      await clientHost.pull("client", { remoteCredentials: { password, username } });
      expect(fs.readFileSync(path.join(clientWorkspace, "README.md"), "utf8")).toBe("# Private v3\n");
    } finally {
      await closeServer(server);
    }
  });

  test("pushes to a remote with host-managed git helpers", async () => {
    const root = tempDir();
    const remoteRepo = path.join(root, "remote", "origin.git");
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(path.dirname(remoteRepo), { recursive: true });
    git(["init", "--bare", "--initial-branch", "main", remoteRepo]);

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Push\n");
    await host.ensureRepository("demo");
    await host.push("demo", { remoteUrl: remoteRepo, setUpstream: true });

    const remoteClone = path.join(root, "remote-clone");
    git(["clone", remoteRepo, remoteClone]);
    expect(fs.readFileSync(path.join(remoteClone, "README.md"), "utf8")).toBe("# Push\n");
  });

  test("continues and aborts repository operations", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Base\n");
    await host.ensureRepository("demo");

    await host.createBranch("demo", { name: "feature/merge", checkout: true });
    writeFile(workspace, "README.md", "# Feature\n");
    gitCommit(workspace, "Feature change");

    await host.checkoutBranch("demo", { name: "main" });
    writeFile(workspace, "README.md", "# Main\n");
    gitCommit(workspace, "Main change");

    expect(gitResult([
      "-c",
      "user.name=Alice",
      "-c",
      "user.email=alice@example.com",
      "merge",
      "feature/merge",
    ], workspace).status).not.toBe(0);
    expect((await host.readSummary("demo")).status.operation.kind).toBe("merge");

    await host.abortOperation("demo");
    expect((await host.readSummary("demo")).status.operation.in_progress).toBe(false);

    expect(gitResult([
      "-c",
      "user.name=Alice",
      "-c",
      "user.email=alice@example.com",
      "merge",
      "feature/merge",
    ], workspace).status).not.toBe(0);
    writeFile(workspace, "README.md", "# Resolved\n");
    await host.stagePaths("demo", { paths: ["README.md"] });
    await host.continueOperation("demo", { actor: { name: "Alice", email: "alice@example.com" } });
    expect((await host.readSummary("demo")).commits[0].subject).toContain("Merge");
  });

  test("serves clone and push over smart HTTP", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Hosted\n");
    await host.ensureRepository("demo");

    const server = createServer(createGitHttpHandler({
      basePath: "/git",
      resolveRepository(repositoryKey) {
        return repositoryKey === "demo" ? { id: "demo", path: workspace } : null;
      },
    }));

    const port = await listen(server);
    const clientRepo = path.join(root, "client");

    try {
      await gitAsync(["clone", `http://127.0.0.1:${port}/git/demo.git`, clientRepo]);
      writeFile(clientRepo, "README.md", "# Hosted v2\n");
      gitCommit(clientRepo, "HTTP update");
      await gitAsync(["push", "origin", "main"], clientRepo);

      expect((await host.readSummary("demo")).commits[0].subject).toBe("HTTP update");
      expect(fs.readFileSync(path.join(workspace, "README.md"), "utf8")).toBe("# Hosted v2\n");
    } finally {
      await closeServer(server);
    }
  });
});
