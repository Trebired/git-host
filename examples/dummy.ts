import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createGitHost, resolveRepositoryPath } from "../src/index.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "@trebired-git-host-"));
const repositoriesRoot = path.join(root, "repos");
const workspace = resolveRepositoryPath({
  rootDir: repositoriesRoot,
  repositoryPath: "demo/workspace",
});

fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, "README.md"), "# Demo\n", "utf8");

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

const summary = await gitHost.ensureRepository("demo", {
  actor: {
    name: "Demo User",
    email: "demo@example.com",
  },
});

console.log(summary.repository);
