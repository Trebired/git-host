import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createGitHost, resolveRepositoryPath } from "#fcd73bf294d5";
import { createExampleRepositoryResolver } from "./repository.js";
import { resolveLogger } from "@package/logger-adapter";

const log = resolveLogger({ source: "@trebired/git-host" });

const root = fs.mkdtempSync(path.join(os.tmpdir(), "@package-git-host-"));
const repositoriesRoot = path.join(root, "repos");
const workspace = resolveRepositoryPath({
    rootDir: repositoriesRoot,
    repositoryPath: "demo/workspace",
});

fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, "README.md"), "# Demo\n", "utf8");

const gitHost = createGitHost({
    resolveRepository: createExampleRepositoryResolver(repositoriesRoot),
});

const summary = await gitHost.ensureRepository("demo", {
    actor: {
      name: "Demo User",
      email: "demo@example.com",
    },
});

log.info("example.dummy", "repository", { repository: summary.repository });
