import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import { runGit } from "#96b00569f1f4";
import type { CreateGitForgeActionsOptions } from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

import type { ActionsRunnerInput } from "./types.js";

async function materializeWorkspace(input: ActionsRunnerInput) {
  const workspaceDirectory = path.join(input.workspace_root, "workspace");
  fs.rmSync(input.workspace_root, { force: true, recursive: true });
  fs.mkdirSync(input.workspace_root, { recursive: true });

  const clone = await runGit(["clone", "--quiet", "--no-checkout", input.repository_path, workspaceDirectory], {
    cwd: input.workspace_root,
  });
  if (!clone.ok) {
    throw new GitHostError("forge_actions_runner_failed", "Failed to clone repository snapshot for workflow run.", {
      repositoryPath: input.repository_path,
      stderr: clone.stderr,
      stdout: clone.stdout,
      workspaceDirectory,
    });
  }

  const checkout = await runGit(["checkout", "--detach", input.commit_hash], {
    cwd: workspaceDirectory,
  });
  if (!checkout.ok) {
    throw new GitHostError("forge_actions_runner_failed", "Failed to checkout workflow snapshot.", {
      commitHash: input.commit_hash,
      repositoryPath: input.repository_path,
      stderr: checkout.stderr,
      stdout: checkout.stdout,
      workspaceDirectory,
    });
  }

  return workspaceDirectory;
}

function resolveActionsWorkspaceRoot(options: CreateGitForgeActionsOptions | undefined, repositoryId: string, runId: string): string {
  const root = text(options?.workspaceRoot, path.join(os.tmpdir(), "@trebired-git-host-actions"));
  return path.join(root, repositoryId, runId);
}

// Deliberately a separate root from the per-run workspace above: release assets must
// outlive the run that produced them, so they can't live under a path any run-cleanup
// logic is allowed to delete.
function resolveReleaseAssetsRoot(options: CreateGitForgeActionsOptions | undefined): string {
  return text(options?.releaseAssetsRoot, path.join(os.tmpdir(), "@trebired-git-host-release-assets"));
}

export {
  materializeWorkspace,
  resolveActionsWorkspaceRoot,
  resolveReleaseAssetsRoot,
};
