import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createGitApiHandler, createGitHost, resolveRepositoryPath } from "#rfvjfxzebkbs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "@trebired-git-host-api-"));
const repositoriesRoot = path.join(root, "repos");
const workspace = resolveRepositoryPath({
  rootDir: repositoriesRoot,
  repositoryPath: "demo/workspace",
});

fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, "README.md"), "# Demo API Repo\n", "utf8");

const gitHost = createGitHost({
  resolveRepository(repositoryId) {
    return {
      id: repositoryId,
      path: resolveRepositoryPath({
        rootDir: repositoriesRoot,
        repositoryPath: `${repositoryId}/workspace`,
      }),
    };
  },
});

await gitHost.ensureRepository("demo", {
  actor: {
    name: "Demo User",
    email: "demo@example.com",
  },
});

const apiServer = createServer(createGitApiHandler({
  basePath: "/api/git",
  gitHost,
}));

apiServer.listen(3100, "127.0.0.1", () => {
  console.log("http://127.0.0.1:3100/api/git/repositories/demo/summary");
});
