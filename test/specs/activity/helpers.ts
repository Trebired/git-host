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
  createServer,
  normalizePublicKey,
  resolveRepositoryPath,
  tempDir,
  writeFile,
} from "#cx668v9vcf0v";

export const TEST_SSH_HOST_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
c2gtZWQyNTUxOQAAACDrHk2LYYz/Wb48L31SaEu6o16Zgees5YocVRe3hBijPgAA
AIj5fD6J+Xw+iQAAAAtzc2gtZWQyNTUxOQAAACDrHk2LYYz/Wb48L31SaEu6o16Z
gees5YocVRe3hBijPgAAAEDESivh5uR7sGC7KJlHyE02UT2Dp4lYMNyHahLU8dRL
/+seTYthjP9ZvjwvfVJoS7qjXpmB56zlihxVF7eEGKM+AAAABGhvc3QB
-----END OPENSSH PRIVATE KEY-----
`;

export const TEST_SSH_CLIENT_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
c2gtZWQyNTUxOQAAACBQ2NjI9vQwnQcfItDexukLqtfSKsjkuAD4FP+IdaYEGwAA
AJAr0oqBK9KKgQAAAAtzc2gtZWQyNTUxOQAAACBQ2NjI9vQwnQcfItDexukLqtfS
KsjkuAD4FP+IdaYEGwAAAECTcL6i3lqUBEavZ9G0aMpVQr5Qg1IyxDVvDm+CHeym
YVDY2Mj29DCdBx8i0N7G6Quq19IqyOS4APgU/4h1pgQbAAAABmNsaWVudAECAwQF
Bgc=
-----END OPENSSH PRIVATE KEY-----
`;

export const TEST_SSH_CLIENT_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFDY2Mj29DCdBx8i0N7G6Quq19IqyOS4APgU/4h1pgQb client";

export const ACTOR = {
  email: "alice@example.com",
  id: "alice",
  name: "Alice",
};

export function createHostWithActivity(
  rootDir: string,
  activity = undefined as ReturnType<typeof createGitForgeActivityRecorder> | undefined,
) {
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

export function createForgeForHost(
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

export function createActivityFixture(repositoryId = "demo") {
  const root = tempDir();
  const repositoriesRoot = path.join(root, "repos");
  const storage = createInMemoryGitForgeStorageAdapter();
  const activity = createGitForgeActivityRecorder({ storage: storage.activity });
  const host = createHostWithActivity(repositoriesRoot, activity);
  const forge = createForgeForHost(repositoriesRoot, host, storage);
  const workspace = resolveRepositoryPath({
    rootDir: repositoriesRoot,
    repositoryPath: `${repositoryId}/workspace`,
  });
  return {
    activity,
    forge,
    host,
    repositoriesRoot,
    repositoryId,
    root,
    storage,
    workspace,
  };
}

export async function seedActivityRepository(
  fixture: ReturnType<typeof createActivityFixture>,
  readmeText: string,
) {
  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeFile(fixture.workspace, "README.md", readmeText);
  await fixture.host.ensureRepository(fixture.repositoryId);
}

export async function expectRecordedPush(
  forge: ReturnType<typeof createForgeForHost>,
  repositoryId: string,
  source: "api" | "http" | "ssh",
) {
  const pushEntries = await forge.listActivity(repositoryId, {
    kind: "repository.push",
    source,
  });
  return {
    entry: pushEntries[0],
    pushEntries,
  };
}

export function createAuthenticatedActivityHttpServer(
  workspace: string,
  username: string,
  password: string,
  activity: ReturnType<typeof createGitForgeActivityRecorder>,
) {
  const authHeader = basicAuthHeader(username, password);
  return createServer(createGitHttpHandler({
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
}

export function createActivitySshServer(
  workspace: string,
  activity: ReturnType<typeof createGitForgeActivityRecorder>,
) {
  return createGitSshServer({
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
}

export function writeClientPrivateKey(root: string) {
  const clientKeyPath = path.join(root, "id_ed25519");
  fs.writeFileSync(clientKeyPath, TEST_SSH_CLIENT_PRIVATE_KEY, { mode: 0o600 });
  return clientKeyPath;
}
