import { GitHostError } from "#ebw9yuqcyi9w";
import type { GitFileContent, GitRepositoryHandle, GitWorkingTree, ReadWorkingTreeFileOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { readRepositoryStatus, parseNumstatOutput } from "#1fu49obi0gq3";
import { runGit, runGitBuffer } from "#jezxo0dsbb92";
import {
  assertRepositoryReady,
  decodeFileContent,
  normalizeFilePath,
  readWorkingTreeFileBuffer,
  sumLines,
  withEntryStats,
} from "./shared.js";

function assertWorkingTreeResult(
  result: { ok: boolean; stderr: string },
  repositoryId: string,
  message: string,
) {
  if (result.ok) return;
  throw new GitHostError("git_command_failed", text(result.stderr, message), {
    repositoryId,
  });
}

function summarizeWorkingTree(
  status: Awaited<ReturnType<typeof readRepositoryStatus>>,
  stagedNumstat: string,
  unstagedNumstat: string,
  stagedDiff: string,
  unstagedDiff: string,
): GitWorkingTree {
  const entries = withEntryStats(
    status.entries,
    parseNumstatOutput(stagedNumstat),
    parseNumstatOutput(unstagedNumstat),
  );
  const stagedEntries = entries.filter((entry) => entry.staged);
  const unstagedEntries = entries.filter((entry) => entry.unstaged);
  const untrackedEntries = entries.filter((entry) => entry.untracked);
  const conflictedEntries = entries.filter((entry) => entry.conflicted);
  const stagedTotals = sumLines(stagedEntries, "staged_lines_added", "staged_lines_removed");
  const unstagedTotals = sumLines(unstagedEntries, "unstaged_lines_added", "unstaged_lines_removed");

  return {
    status,
    entries,
    staged_entries: stagedEntries,
    unstaged_entries: unstagedEntries,
    untracked_entries: untrackedEntries,
    conflicted_entries: conflictedEntries,
    staged_diff: stagedDiff,
    unstaged_diff: unstagedDiff,
    staged_lines_added: stagedTotals.lines_added,
    staged_lines_removed: stagedTotals.lines_removed,
    unstaged_lines_added: unstagedTotals.lines_added,
    unstaged_lines_removed: unstagedTotals.lines_removed,
  };
}

async function readRepositoryWorkingTree(repository: GitRepositoryHandle): Promise<GitWorkingTree> {
  await assertRepositoryReady(repository);

  const [status, stagedNumstatRes, unstagedNumstatRes, stagedDiffRes, unstagedDiffRes] = await Promise.all([
    readRepositoryStatus(repository.path),
    runGit(["diff", "--cached", "--find-renames", "--numstat"], { cwd: repository.path }),
    runGit(["diff", "--find-renames", "--numstat"], { cwd: repository.path }),
    runGit(["diff", "--cached", "--find-renames"], { cwd: repository.path }),
    runGit(["diff", "--find-renames"], { cwd: repository.path }),
  ]);

  assertWorkingTreeResult(stagedNumstatRes, repository.id, "Failed to read staged repository changes.");
  assertWorkingTreeResult(unstagedNumstatRes, repository.id, "Failed to read unstaged repository changes.");
  assertWorkingTreeResult(stagedDiffRes, repository.id, "Failed to read staged repository diff.");
  assertWorkingTreeResult(unstagedDiffRes, repository.id, "Failed to read unstaged repository diff.");

  return summarizeWorkingTree(
    status,
    stagedNumstatRes.stdout,
    unstagedNumstatRes.stdout,
    String(stagedDiffRes.stdout || ""),
    String(unstagedDiffRes.stdout || ""),
  );
}

async function readRepositoryStagedFile(
  repository: GitRepositoryHandle,
  options: ReadWorkingTreeFileOptions,
): Promise<GitFileContent> {
  await assertRepositoryReady(repository);
  const filePath = normalizeFilePath(options);
  const objectSpec = `:${filePath}`;

  const [revRes, sizeRes, contentRes] = await Promise.all([
    runGit(["rev-parse", "--verify", objectSpec], { cwd: repository.path }),
    runGit(["cat-file", "-s", objectSpec], { cwd: repository.path }),
    runGitBuffer(["show", objectSpec], { cwd: repository.path }),
  ]);

  if (!revRes.ok) {
    throw new GitHostError("git_command_failed", text(revRes.stderr, "Staged file does not exist."), {
      path: filePath,
      repositoryId: repository.id,
      source: "staged",
    });
  }
  if (!sizeRes.ok) {
    throw new GitHostError("git_command_failed", text(sizeRes.stderr, "Failed to read staged file size."), {
      path: filePath,
      repositoryId: repository.id,
      source: "staged",
    });
  }
  if (!contentRes.ok) {
    throw new GitHostError("git_command_failed", text(contentRes.stderr, "Failed to read staged file content."), {
      path: filePath,
      repositoryId: repository.id,
      source: "staged",
    });
  }

  return {
    object: text(revRes.stdout),
    path: filePath,
    size: Number(text(sizeRes.stdout)) || 0,
    source: "staged",
    ...decodeFileContent(contentRes.stdout),
  };
}

async function readRepositoryUnstagedFile(
  repository: GitRepositoryHandle,
  options: ReadWorkingTreeFileOptions,
): Promise<GitFileContent> {
  await assertRepositoryReady(repository);
  const filePath = normalizeFilePath(options);
  const content = readWorkingTreeFileBuffer(repository, filePath);

  return {
    object: null,
    path: filePath,
    size: content.byteLength,
    source: "unstaged",
    ...decodeFileContent(content),
  };
}

export { readRepositoryStagedFile, readRepositoryUnstagedFile, readRepositoryWorkingTree };
