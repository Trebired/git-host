import fs from "node:fs";
import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type { GitFileContent, GitRepositoryHandle, GitWorkingTree, GitWorkingTreeEntry, ReadWorkingTreeFileOptions } from "#14021226ec9b";
import { normalizeRepositoryRelativePath } from "#390741ebf5ab";
import { text } from "#62f869522d1f";
import { assertRepositoryReady, runGit } from "#96b00569f1f4";
import { decodeGitBufferContent } from "#txh6e7rydc5d";

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
  stagedStats: Map<string, {lines_added:number;lines_removed:number}>,
  unstagedStats: Map<string, {lines_added:number;lines_removed:number}>,
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

const decodeFileContent: (stdout: Buffer) => Pick<GitFileContent, "content"|"encoding"|"is_binary"> =
decodeGitBufferContent;

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
