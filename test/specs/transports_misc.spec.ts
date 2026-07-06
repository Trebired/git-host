import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { utils as sshUtils } from "ssh2";

import {
  compareSshPublicKeys,
  createGitHttpHandler,
  createGitSshServer,
  fingerprintSshPublicKey,
  generateSshKeyPair,
  GitHostError,
  normalizeSshPublicKey,
} from "#rfvjfxzebkbs";
import { closeServer, createHost, createServer, git, gitAsync, gitCommit, listen, normalizePublicKey, resolveRepositoryPath, sleep, tempDir, writeFile } from "./helpers.js";

// The SSH round-trip test drives git through the system `ssh` client. Skip it
// gracefully where that client is unavailable instead of failing the build.
function sshClientAvailable() {
  try {
    return spawnSync("ssh", ["-V"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

test("applies HTTP identity, permission, and audit hooks", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
    const events: any[] = [];

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Hooks\n");
    await host.ensureRepository("demo");

    const server = createServer(createGitHttpHandler({
      basePath: "/git",
      authenticate({ request }) {
        const user = String(request.headers["x-git-user"] || "").trim();
        return user ? { identity: { role: String(request.headers["x-git-role"] || "reader"), user }, remoteUser: user } : null;
      },
      authorize({ identity, wantsWrite }) {
        const account = identity as { role?: string; user?: string } | undefined;
        if (!account?.user) return { allowed: false, message: "Auth required.", status: 401 };
        if (wantsWrite && account.role !== "writer") return { allowed: false, message: "Write denied.", status: 403 };
        return true;
      },
      onAuditEvent(event) {
        events.push(event);
      },
      resolveRepository(repositoryKey) {
        return repositoryKey === "demo" ? { id: "demo", path: workspace } : null;
      },
    }));

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}/git/demo.git/info/refs`;

    try {
      expect((await fetch(`${baseUrl}?service=git-upload-pack`)).status).toBe(401);
      expect((await fetch(`${baseUrl}?service=git-upload-pack`, { headers: { "x-git-role": "reader", "x-git-user": "alice" } })).status).toBe(200);
      expect((await fetch(`${baseUrl}?service=git-receive-pack`, { headers: { "x-git-role": "reader", "x-git-user": "alice" } })).status).toBe(403);
      expect((await fetch(`${baseUrl}?service=git-receive-pack`, { headers: { "x-git-role": "writer", "x-git-user": "alice" } })).status).toBe(200);
      await sleep(20);

      expect(events.some((event) => event.outcome === "denied" && event.status === 401)).toBe(true);
      expect(events.some((event) => event.outcome === "denied" && event.status === 403)).toBe(true);
      expect(events.some((event) => event.outcome === "completed" && event.remoteUser === "alice")).toBe(true);
    } finally {
      await closeServer(server);
    }
});

const sshTest = sshClientAvailable() ? test : test.skip;
sshTest("serves clone and push over SSH", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Hosted SSH\n");
    await host.ensureRepository("demo");

    const hostKeyPair = sshUtils.generateKeyPairSync("ed25519", { comment: "git-host-test-server" });
    const clientKeyPair = sshUtils.generateKeyPairSync("ed25519", { comment: "git-host-test-client" });
    const clientKeyPath = path.join(root, "id_ed25519");
    fs.writeFileSync(clientKeyPath, clientKeyPair.private, { mode: 0o600 });
    const events: any[] = [];

    const sshServer: any = createGitSshServer({
      hostKeys: [hostKeyPair.private],
      authenticate({ publicKey, username }) {
        if (username !== "git") return null;
        if (normalizePublicKey(publicKey) !== normalizePublicKey(clientKeyPair.public)) return null;
        return { publicKey: clientKeyPair.public, remoteUser: "git-test-client" };
      },
      resolveRepository(repositoryKey) {
        return repositoryKey === "demo" ? { id: "demo", path: workspace } : null;
      },
      onAuditEvent(event) {
        events.push(event);
      },
    });

    const port = await listen(sshServer);
    const sshCommand = `ssh -i ${clientKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o LogLevel=ERROR -p ${port}`;
    const clientRepo = path.join(root, "ssh-client");

    try {
      await gitAsync(["clone", `ssh://git@127.0.0.1:${port}/demo.git`, clientRepo], undefined, { GIT_SSH_COMMAND: sshCommand });
      writeFile(clientRepo, "README.md", "# Hosted SSH v2\n");
      gitCommit(clientRepo, "SSH update");
      await gitAsync(["push", "origin", "main"], clientRepo, { GIT_SSH_COMMAND: sshCommand });

      expect((await host.readSummary("demo")).commits[0].subject).toBe("SSH update");
      expect(events.some((event) => event.outcome === "completed" && event.service === "git-upload-pack")).toBe(true);
      expect(events.some((event) => event.outcome === "completed" && event.service === "git-receive-pack")).toBe(true);
    } finally {
      await closeServer(sshServer);
    }
}, { timeout: 15_000 });

test("generates and compares SSH public keys", () => {
    const keyPair = generateSshKeyPair({ algorithm: "ed25519", comment: "git-host-test" });
    const normalized = normalizeSshPublicKey(keyPair.publicKey);
    expect(normalized.split(/\s+/)).toHaveLength(2);
    expect(compareSshPublicKeys(keyPair.publicKey, `${normalized} different-comment`)).toBe(true);
    expect(fingerprintSshPublicKey(keyPair.publicKey).startsWith("SHA256:")).toBe(true);
});

test("clones from a real remote and preserves origin metadata", async () => {
    const root = tempDir();
    const remoteRepo = path.join(root, "remote", "origin.git");
    const seedRepo = path.join(root, "seed", "seed");

    fs.mkdirSync(path.dirname(remoteRepo), { recursive: true });
    fs.mkdirSync(path.dirname(seedRepo), { recursive: true });
    git(["init", "--bare", "--initial-branch", "main", remoteRepo]);
    git(["clone", remoteRepo, seedRepo]);
    writeFile(seedRepo, "README.md", "# Seed\n");
    git(["add", "-A"], seedRepo);
    git(["-c", "user.name=Seed", "-c", "user.email=seed@example.com", "commit", "-m", "Seed commit"], seedRepo);
    git(["push", "origin", "main"], seedRepo);

    const host = createHost(path.join(root, "repos"));
    const summary = await host.ensureRepository("demo", { cloneUrl: remoteRepo, remoteUrl: remoteRepo });
    expect(summary.repository.remote_origin_url).toBe(remoteRepo);
    expect(summary.commits[0].subject).toBe("Seed commit");
});

test("serializes repository locks", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const order: string[] = [];

    const values = await Promise.all([
      host.withRepositoryLock("demo", async () => {
        order.push("first-start");
        await sleep(40);
        order.push("first-end");
        return "first";
      }),
      host.withRepositoryLock("demo", async () => {
        order.push("second-start");
        order.push("second-end");
        return "second";
      }),
    ]);

    expect(values).toEqual(["first", "second"]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
});

test("rejects repository path traversal", () => {
  expect(() => resolveRepositoryPath({ rootDir: "/srv/git", repositoryPath: "../escape" })).toThrow(GitHostError);
  expect(() => resolveRepositoryPath({ rootDir: "/srv/git", repositoryPath: "/absolute/path" })).toThrow(GitHostError);
});
