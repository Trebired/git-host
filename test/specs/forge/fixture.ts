import fs from "node:fs";
import path from "node:path";

import {
  createGitForge,
  createGitForgeApiHandler,
  createInMemoryGitForgeStorageAdapter,
} from "#rfvjfxzebkbs";
import { createHost, createServer, resolveRepositoryPath, tempDir } from "#cx668v9vcf0v";

function actorHeaders(actorId = "alice") {
  return {
    "content-type": "application/json",
    "x-actor-id": actorId,
  };
}

function createForgeFixture() {
  const root = tempDir();
  const repositoriesRoot = path.join(root, "repos");
  const host = createHost(repositoriesRoot);
  const storage = createInMemoryGitForgeStorageAdapter();
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
  const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });
  fs.mkdirSync(workspace, { recursive: true });
  return {
    forge,
    host,
    repositoriesRoot,
    storage,
    workspace,
  };
}

function createForgeServer(
  forge: ReturnType<typeof createForgeFixture>["forge"],
  host: ReturnType<typeof createForgeFixture>["host"],
) {
  return createServer(createGitForgeApiHandler({
    basePath: "/api/git",
    forge,
    gitHost: host,
    resolveActor(request) {
      const header = Array.isArray(request.headers["x-actor-id"]) ? request.headers["x-actor-id"][0] : request.headers["x-actor-id"];
      return header ? { id: String(header), name: "Alice", email: "alice@example.com" } : null;
    },
  }));
}

export { actorHeaders, createForgeFixture, createForgeServer };
