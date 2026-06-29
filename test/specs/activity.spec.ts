import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {
  createGitForge,
  createGitForgeActivityRecorder,
  createGitHost,
  createGitHttpHandler,
  createGitSshServer,
  createInMemoryGitForgeStorageAdapter,
} from "#rfvjfxzebkbs";
import {
  basicAuthHeader,
  closeServer,
  createServer,
  git,
  gitAsync,
  gitCommit,
  listen,
  normalizePublicKey,
  resolveRepositoryPath,
  sleep,
  tempDir,
  writeFile,
} from "./helpers.js";

const TEST_SSH_HOST_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
c2gtZWQyNTUxOQAAACDrHk2LYYz/Wb48L31SaEu6o16Zgees5YocVRe3hBijPgAA
AIj5fD6J+Xw+iQAAAAtzc2gtZWQyNTUxOQAAACDrHk2LYYz/Wb48L31SaEu6o16Z
gees5YocVRe3hBijPgAAAEDESivh5uR7sGC7KJlHyE02UT2Dp4lYMNyHahLU8dRL
/+seTYthjP9ZvjwvfVJoS7qjXpmB56zlihxVF7eEGKM+AAAABGhvc3QB
-----END OPENSSH PRIVATE KEY-----
`;

const TEST_SSH_CLIENT_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
c2gtZWQyNTUxOQAAACBQ2NjI9vQwnQcfItDexukLqtfSKsjkuAD4FP+IdaYEGwAA
AJAr0oqBK9KKgQAAAAtzc2gtZWQyNTUxOQAAACBQ2NjI9vQwnQcfItDexukLqtfS
KsjkuAD4FP+IdaYEGwAAAECTcL6i3lqUBEavZ9G0aMpVQr5Qg1IyxDVvDm+CHeym
YVDY2Mj29DCdBx8i0N7G6Quq19IqyOS4APgU/4h1pgQbAAAABmNsaWVudAECAwQF
Bgc=
-----END OPENSSH PRIVATE KEY-----
`;

const TEST_SSH_CLIENT_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFDY2Mj29DCdBx8i0N7G6Quq19IqyOS4APgU/4h1pgQb client";

function createHostWithActivity(rootDir: string, activity = undefined as ReturnType<typeof createGitForgeActivityRecorder> | undefined) {
  return createGitHost({
    activity,
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({
          rootDir,
          repositoryPath: `${repositoryId}/workspace`,
        }),
      };
    },
  });
}

function createForgeForHost(
  repositoriesRoot: string,
  host: ReturnType<typeof createHostWithActivity>,
  storage: ReturnType<typeof createInMemoryGitForgeStorageAdapter>,
) {
  return createGitForge({
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
}

describe("@trebired/git-host activity", () => {
  test("records HTTP push activity through the transport audit hook", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const username = "alice";
    const password = "secret";
    const authHeader = basicAuthHeader(username, password);
    const storage = createInMemoryGitForgeStorageAdapter();
    const activity = createGitForgeActivityRecorder({ storage: storage.activity });
    const host = createHostWithActivity(repositoriesRoot, activity);
    const forge = createForgeForHost(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Hosted HTTP\n");
    await host.ensureRepository("demo");

    const server = createServer(createGitHttpHandler({
      activity,
      authenticate({ request }) {
        return String(request.headers.authorization || "") === authHeader
          ? { identity: { id: username, name: "Alice" }, remoteUser: username }
          : null;
      },
      authorize({ remoteUser }) {
        return remoteUser === username
          ? true
          : {
            allowed: false,
            headers: { "www-authenticate": 'Basic realm="git-host"' },
            message: "Auth required.",
            status: 401,
          };
      },
      basePath: "/git",
      resolveRepository(repositoryKey) {
        return repositoryKey === "demo" ? { id: "demo", path: workspace } : null;
      },
    }));

    const port = await listen(server);
    const clientRepo = path.join(root, "http-client");
    const remoteUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/git/demo.git`;

    try {
      await gitAsync(["clone", remoteUrl, clientRepo]);
      writeFile(clientRepo, "README.md", "# Hosted HTTP v2\n");
      gitCommit(clientRepo, "HTTP update");
      await gitAsync(["push", "origin", "main"], clientRepo);
      await sleep(20);

      const pushEntries = await forge.listActivity("demo", {
        kind: "repository.push",
        source: "http",
      });
      expect(pushEntries).toHaveLength(1);
      expect(pushEntries[0]).toMatchObject({
        actor_id: "alice",
        actor_label: "Alice",
        kind: "repository.push",
        repository_id: "demo",
        source: "http",
      });
      expect(pushEntries[0].metadata).toMatchObject({
        branch: "main",
        remote_user: "alice",
        service: "git-receive-pack",
        transport: "http",
      });
    } finally {
      await closeServer(server);
    }
  }, { timeout: 15_000 });

  test("records SSH push activity through the transport audit hook", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const activity = createGitForgeActivityRecorder({ storage: storage.activity });
    const host = createHostWithActivity(repositoriesRoot, activity);
    const forge = createForgeForHost(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Hosted SSH\n");
    await host.ensureRepository("demo");

    const clientKeyPath = path.join(root, "id_ed25519");
    fs.writeFileSync(clientKeyPath, TEST_SSH_CLIENT_PRIVATE_KEY, { mode: 0o600 });

    const sshServer: any = createGitSshServer({
      activity,
      authenticate({ publicKey, username }) {
        if (username !== "git") return null;
        if (normalizePublicKey(publicKey) !== normalizePublicKey(TEST_SSH_CLIENT_PUBLIC_KEY)) return null;
        return {
          identity: { id: "git-test-client", name: "SSH Client" },
          publicKey: TEST_SSH_CLIENT_PUBLIC_KEY,
          remoteUser: "git-test-client",
        };
      },
      hostKeys: [TEST_SSH_HOST_PRIVATE_KEY],
      resolveRepository(repositoryKey) {
        return repositoryKey === "demo" ? { id: "demo", path: workspace } : null;
      },
    });

    const port = await listen(sshServer);
    const sshCommand = `ssh -i ${clientKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes -o LogLevel=ERROR -p ${port}`;
    const clientRepo = path.join(root, "ssh-client");

    try {
      await gitAsync(["clone", `ssh://git@127.0.0.1:${port}/demo.git`, clientRepo], undefined, { GIT_SSH_COMMAND: sshCommand });
      writeFile(clientRepo, "README.md", "# Hosted SSH v2\n");
      gitCommit(clientRepo, "SSH update");
      await gitAsync(["push", "origin", "main"], clientRepo, { GIT_SSH_COMMAND: sshCommand });
      await sleep(20);

      const pushEntries = await forge.listActivity("demo", {
        kind: "repository.push",
        source: "ssh",
      });
      expect(pushEntries).toHaveLength(1);
      expect(pushEntries[0]).toMatchObject({
        actor_id: "git-test-client",
        actor_label: "SSH Client",
        kind: "repository.push",
        source: "ssh",
      });
      expect(pushEntries[0].metadata).toMatchObject({
        branch: "main",
        remote_user: "git-test-client",
        service: "git-receive-pack",
        transport: "ssh",
        username: "git",
      });
    } finally {
      await closeServer(sshServer);
    }
  }, { timeout: 15_000 });

  test("records API push, fetch, and pull activity without duplicates", async () => {
    const root = tempDir();
    const remoteRepo = path.join(root, "remote", "origin.git");
    const externalClone = path.join(root, "external-clone");
    const clientRoot = path.join(root, "client-repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const activity = createGitForgeActivityRecorder({ storage: storage.activity });
    const clientHost = createHostWithActivity(clientRoot, activity);
    const clientForge = createForgeForHost(clientRoot, clientHost, storage);
    const clientWorkspace = resolveRepositoryPath({ rootDir: clientRoot, repositoryPath: "client/workspace" });

    fs.mkdirSync(path.dirname(remoteRepo), { recursive: true });
    git(["init", "--bare", "--initial-branch", "main", remoteRepo]);

    await clientHost.ensureRepository("client", {
      cloneUrl: remoteRepo,
      remoteUrl: remoteRepo,
    });

    writeFile(clientWorkspace, "README.md", "# API push\n");
    await clientHost.stagePaths("client");
    await clientHost.commit("client", {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
      message: "API update",
    });
    await clientHost.push("client", {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
      setUpstream: true,
    });

    await gitAsync(["clone", remoteRepo, externalClone]);
    writeFile(externalClone, "README.md", "# External update\n");
    gitCommit(externalClone, "External update");
    await gitAsync(["push", "origin", "main"], externalClone);

    await clientHost.fetch("client");
    await clientHost.pull("client", {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
    });

    const activityEntries = await clientForge.listActivity("client", {
      source: "api",
    });
    expect(activityEntries.map((entry) => entry.kind)).toEqual([
      "repository.pull",
      "repository.fetch",
      "repository.push",
    ]);

    const pushEntries = await clientForge.listActivity("client", {
      kind: "repository.push",
      source: "api",
    });
    const fetchEntries = await clientForge.listActivity("client", {
      kind: "repository.fetch",
      source: "api",
    });
    const pullEntries = await clientForge.listActivity("client", {
      kind: "repository.pull",
      source: "api",
    });

    expect(pushEntries).toHaveLength(1);
    expect(fetchEntries).toHaveLength(1);
    expect(pullEntries).toHaveLength(1);

    expect(pushEntries[0]).toMatchObject({
      actor_id: "alice",
      actor_label: "Alice",
      source: "api",
    });
    expect(pushEntries[0].metadata).toMatchObject({
      branch: "main",
      remote: "origin",
      set_upstream: true,
    });
    expect(fetchEntries[0].metadata).toMatchObject({
      branch: "main",
      remote: "origin",
    });
    expect(pullEntries[0].metadata).toMatchObject({
      branch: "main",
      ff_only: true,
      remote: "origin",
    });
  }, { timeout: 15_000 });

  test("keeps release activity working and returns sorted, filterable activity for empty repositories", async () => {
    const root = tempDir();
    const repositoriesRoot = path.join(root, "repos");
    const storage = createInMemoryGitForgeStorageAdapter();
    const activity = createGitForgeActivityRecorder({ storage: storage.activity });
    const host = createHostWithActivity(repositoriesRoot, activity);
    const forge = createForgeForHost(repositoriesRoot, host, storage);
    const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

    expect(await forge.listActivity("demo")).toEqual([]);

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Releases\n");
    await host.ensureRepository("demo", {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
    });

    await activity.recordActivity({
      actor_id: "alice",
      actor_label: "Alice",
      created_at: "2026-01-01T00:00:00.000Z",
      kind: "star",
      repository_id: "demo",
      source: "forge",
    });
    await activity.recordActivity({
      actor_id: "bob",
      actor_label: "Bob",
      created_at: "2026-01-03T00:00:00.000Z",
      kind: "watch",
      repository_id: "demo",
      source: "forge",
    });
    await activity.recordActivity({
      actor_id: "alice",
      actor_label: "Alice",
      created_at: "2026-01-02T00:00:00.000Z",
      kind: "repository.fetch",
      repository_id: "demo",
      source: "api",
    });

    await host.createTag("demo", {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
      message: "Version 1",
      name: "v1",
      ref: "main",
    });

    const createdRelease = await forge.createRelease("demo", {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
      existingTagName: "v1",
      notes: "Initial release",
      title: "Version 1",
    });
    await forge.updateRelease("demo", createdRelease.id, {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
      notes: "Updated release notes",
    });
    await forge.deleteRelease("demo", createdRelease.id, {
      actor: { email: "alice@example.com", id: "alice", name: "Alice" },
    });

    const sorted = await forge.listActivity("demo");
    const manualKinds = sorted
      .filter((entry) => entry.kind === "watch" || entry.kind === "repository.fetch" || entry.kind === "star")
      .map((entry) => entry.kind);
    expect(manualKinds).toEqual(["watch", "repository.fetch", "star"]);

    const forgeOnly = await forge.listActivity("demo", {
      actor: "alice",
      source: "forge",
    });
    expect(forgeOnly.some((entry) => entry.kind === "release.create")).toBe(true);
    expect(forgeOnly.some((entry) => entry.kind === "release.update")).toBe(true);
    expect(forgeOnly.some((entry) => entry.kind === "release.delete")).toBe(true);

    const releaseCreateEntries = await forge.listActivity("demo", {
      kind: "release.create",
      source: "forge",
    });
    expect(releaseCreateEntries).toHaveLength(1);
    expect(releaseCreateEntries[0]).toMatchObject({
      actor_id: "alice",
      actor_label: "Alice",
      source: "forge",
    });
    expect(releaseCreateEntries[0].metadata).toMatchObject({
      release_id: createdRelease.id,
      tag_name: "v1",
    });

    const dateFiltered = await forge.listActivity("demo", {
      createdAfter: "2026-01-02T00:00:00.000Z",
      createdBefore: "2026-01-03T00:00:00.000Z",
    });
    expect(dateFiltered.some((entry) => entry.kind === "repository.fetch")).toBe(true);
    expect(dateFiltered.some((entry) => entry.kind === "star")).toBe(false);
  });
});
