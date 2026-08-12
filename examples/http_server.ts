import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createGitHost, createGitHttpHandler, resolveRepositoryPath } from "#fcd73bf294d5";
import { createExampleRepositoryResolver } from "./repository.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "@package-git-host-http-"));
const repositoriesRoot = path.join(root, "repos");
const workspace = resolveRepositoryPath({
    rootDir: repositoriesRoot,
    repositoryPath: "demo/workspace",
});

fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, "README.md"), "# Demo HTTP Repo\n", "utf8");

const gitHost = createGitHost({
    resolveRepository: createExampleRepositoryResolver(repositoriesRoot),
});

await gitHost.ensureRepository("demo", {
    actor: {
      name: "Demo User",
      email: "demo@example.com",
    },
});

const server = createServer(createGitHttpHandler({
      basePath: "/git",
      resolveRepository: createExampleRepositoryResolver(repositoriesRoot),
}));

server.listen(3000, "127.0.0.1", () => {
    console.log(`git clone http://127.0.0.1:3000/git/demo.git`);
});
