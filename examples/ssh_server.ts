import { utils as sshUtils } from "ssh2";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createGitHost, createGitSshServer, resolveRepositoryPath } from "../src/index.js";

const authorizedKey = String(process.env.GIT_HOST_AUTHORIZED_KEY || "").trim();
if (!authorizedKey) {
  throw new Error("Set GIT_HOST_AUTHORIZED_KEY to an authorized SSH public key before running demo:ssh.");
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "@trebired-git-host-ssh-"));
const repositoriesRoot = path.join(root, "repos");
const workspace = resolveRepositoryPath({
  rootDir: repositoriesRoot,
  repositoryPath: "demo/workspace",
});

fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, "README.md"), "# Demo SSH Repo\n", "utf8");

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

const hostKeyPair = sshUtils.generateKeyPairSync("ed25519", {
  comment: "git-host-demo-server",
});

const sshServer: any = createGitSshServer({
  hostKeys: [hostKeyPair.private],
  authenticate({ publicKey, username }) {
    if (username !== "git") return null;
    const normalize = (value: string) => String(value || "").trim().split(/\s+/).slice(0, 2).join(" ");
    if (normalize(publicKey) !== normalize(authorizedKey)) return null;
    return {
      publicKey: authorizedKey,
      remoteUser: "demo-user",
    };
  },
  resolveRepository(repositoryKey) {
    return {
      id: repositoryKey,
      path: resolveRepositoryPath({
        rootDir: repositoriesRoot,
        repositoryPath: `${repositoryKey}/workspace`,
      }),
    };
  },
});

sshServer.listen(2222, "127.0.0.1", () => {
  console.log("git clone ssh://git@127.0.0.1:2222/demo.git");
});
