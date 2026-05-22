import fs from "node:fs";
import path from "node:path";

import { GitHostError } from "../../errors.js";
import type { GitFileContent, GitRepositoryHandle, GitWorkingTree, GitWorkingTreeEntry, ReadWorkingTreeFileOptions } from "../../types.js";
import { normalizeRepositoryRelativePath } from "../../utils/paths.js";
import { text } from "../../utils/text.js";
import { repositoryExists, runGit } from "../run_git.js";

function normalizePathList(input: unknown): string[] {
  const values = Array.isArray(input) ? input : [input];
  return Array.from(new Set(
    values
      .map((value) => {
        const raw = text(value);
        return raw ? normalizeRepositoryRelativePath(raw) : "";
      })
      .filter(Boolean),
  ));
}

function withEntryStats(
  entries: GitWorkingTree["status"]["entries"],
  stagedStats: Map<string, { lines_added: number; lines_removed: number }>,
  unstagedStats: Map<string, { lines_added: number; lines_removed: number }>,
): GitWorkingTreeEntry[] {
  return entries.map((entry) => {
    const staged = stagedStats.get(entry.path) || { lines_added: 0, lines_removed: 0 };
    const unstaged = unstagedStats.get(entry.path) || { lines_added: 0, lines_removed: 0 };
    return {
      ...entry,
      staged_lines_added: Number(staged.lines_added) || 0,
      staged_lines_removed: Number(staged.lines_removed) || 0,
      unstaged_lines_added: Number(unstaged.lines_added) || 0,
      unstaged_lines_removed: Number(unstaged.lines_removed) || 0,
    };
  });
}

function sumLines(
  entries: GitWorkingTreeEntry[],
  addedKey: "staged_lines_added" | "unstaged_lines_added",
  removedKey: "staged_lines_removed" | "unstaged_lines_removed",
) {
  return entries.reduce((sum, entry) => ({
    lines_added: sum.lines_added + (Number(entry[addedKey]) || 0),
    lines_removed: sum.lines_removed + (Number(entry[removedKey]) || 0),
  }), { lines_added: 0, lines_removed: 0 });
}

function decodeFileContent(stdout: Buffer): Pick<GitFileContent, "content" | "encoding" | "is_binary"> {
  if (stdout.includes(0)) {
    return {
      content: stdout.toString("base64"),
      encoding: "base64",
      is_binary: true,
    };
  }

  const utf8 = stdout.toString("utf8");
  if (Buffer.from(utf8, "utf8").equals(stdout)) {
    return {
      content: utf8,
      encoding: "utf8",
      is_binary: false,
    };
  }

  return {
    content: stdout.toString("base64"),
    encoding: "base64",
    is_binary: true,
  };
}

async function assertRepositoryReady(repository: GitRepositoryHandle): Promise<void> {
  const hasRepo = await repositoryExists(repository.path);
  if (!hasRepo) {
    throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
      repositoryId: repository.id,
      path: repository.path,
    });
  }
}

async function repositoryHasHead(workspaceRoot: string): Promise<boolean> {
  const headRes = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: workspaceRoot });
  return headRes.ok === true;
}

function normalizeFilePath(options: ReadWorkingTreeFileOptions | undefined): string {
  return normalizeRepositoryRelativePath(options && options.path);
}

function readWorkingTreeFileBuffer(repository: GitRepositoryHandle, filePath: string): Buffer {
  const absolutePath = path.resolve(repository.path, ...filePath.split("/"));
  try {
    return fs.readFileSync(absolutePath);
  } catch (error) {
    throw new GitHostError("git_command_failed", error instanceof Error ? error.message : "Failed to read working tree file.", {
      path: filePath,
      repositoryId: repository.id,
      source: "unstaged",
    });
  }
}

export {
  assertRepositoryReady,
  decodeFileContent,
  normalizeFilePath,
  normalizePathList,
  readWorkingTreeFileBuffer,
  repositoryHasHead,
  sumLines,
  withEntryStats,
};
