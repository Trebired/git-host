import { GitHostError } from "../errors.js";
import type { GitBlob, GitCommitDetail, GitCompareSummary, GitRepositoryHandle, GitTreeEntry } from "../types.js";
import { normalizeRepositoryRelativePath } from "../utils/paths.js";
import { text } from "../utils/text.js";
import { parseCommitLogOutput, parseNameStatusOutput, parseNumstatOutput } from "./repository.js";
import { runGit, runGitBuffer } from "./run_git.js";
import {
  assertRepositoryReady,
  decodeBlobContent,
  parseCommitMeta,
  parseLsTreeBuffer,
  resolveCommitForRef,
  summarizeFileLines,
  withFileStats,
} from "./inspect/helpers.js";

async function listRepositoryTree(
  repository: GitRepositoryHandle,
  options: {
    path?: string;
    recursive?: boolean;
    ref?: string;
  } = {},
): Promise<GitTreeEntry[]> {
  await assertRepositoryReady(repository);
  const ref = text(options.ref, "HEAD");
  const treePath = options.path ? normalizeRepositoryRelativePath(options.path) : "";
  const recursive = options.recursive === true;
  const treeSpec = treePath ? `${ref}:${treePath}` : ref;
  const args = ["ls-tree", "-z", "-l"];
  if (recursive) args.push("-r");
  args.push(treeSpec);

  const treeRes = await runGitBuffer(args, { cwd: repository.path });
  if (treeRes.ok) {
    return parseLsTreeBuffer(treeRes.stdout, treePath);
  }

  if (treePath) {
    const fallbackRes = await runGitBuffer(["ls-tree", "-z", "-l", ref, "--", treePath], {
      cwd: repository.path,
    });
    if (fallbackRes.ok) {
      return parseLsTreeBuffer(fallbackRes.stdout, "");
    }
  }

  throw new GitHostError("git_command_failed", text(treeRes.stderr, "Failed to read repository tree."), {
    path: treePath,
    ref,
    repositoryId: repository.id,
  });
}

async function readRepositoryBlob(
  repository: GitRepositoryHandle,
  options: {
    path?: string;
    ref?: string;
  },
): Promise<GitBlob> {
  await assertRepositoryReady(repository);
  const ref = text(options && options.ref, "HEAD");
  const blobPath = normalizeRepositoryRelativePath(options && options.path);
  const objectSpec = `${ref}:${blobPath}`;

  const [revRes, typeRes, sizeRes, contentRes] = await Promise.all([
    runGit(["rev-parse", "--verify", objectSpec], { cwd: repository.path }),
    runGit(["cat-file", "-t", objectSpec], { cwd: repository.path }),
    runGit(["cat-file", "-s", objectSpec], { cwd: repository.path }),
    runGitBuffer(["show", objectSpec], { cwd: repository.path }),
  ]);

  if (!revRes.ok) {
    throw new GitHostError("git_command_failed", text(revRes.stderr, "Blob does not exist."), {
      path: blobPath,
      ref,
      repositoryId: repository.id,
    });
  }
  if (!typeRes.ok || text(typeRes.stdout) !== "blob") {
    throw new GitHostError("git_command_failed", text(typeRes.stderr, "Requested path is not a blob."), {
      path: blobPath,
      ref,
      repositoryId: repository.id,
    });
  }
  if (!sizeRes.ok) {
    throw new GitHostError("git_command_failed", text(sizeRes.stderr, "Failed to read blob size."), {
      path: blobPath,
      ref,
      repositoryId: repository.id,
    });
  }
  if (!contentRes.ok) {
    throw new GitHostError("git_command_failed", text(contentRes.stderr, "Failed to read blob content."), {
      path: blobPath,
      ref,
      repositoryId: repository.id,
    });
  }

  return {
    object: text(revRes.stdout),
    path: blobPath,
    ref,
    size: Number(text(sizeRes.stdout)) || 0,
    ...decodeBlobContent(contentRes.stdout),
  };
}

async function readRepositoryCommit(repository: GitRepositoryHandle, commitRefInput: unknown): Promise<GitCommitDetail> {
  await assertRepositoryReady(repository);
  const commitRef = text(commitRefInput);
  if (!commitRef) {
    throw new GitHostError("git_command_failed", "Commit ref is required.");
  }

  const revRes = await runGit(["rev-parse", "--verify", `${commitRef}^{commit}`], { cwd: repository.path });
  if (!revRes.ok) {
    throw new GitHostError("git_command_failed", text(revRes.stderr, "Commit does not exist."), {
      commitRef,
      repositoryId: repository.id,
    });
  }

  const commitHash = text(revRes.stdout);
  const [metaRes, messageRes, numstatRes, nameStatusRes, diffRes] = await Promise.all([
    runGit(
      [
        "show",
        "--quiet",
        "--date=iso-strict",
        "--format=%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s",
        commitHash,
      ],
      { cwd: repository.path },
    ),
    runGit(["show", "--quiet", "--format=%B", commitHash], { cwd: repository.path }),
    runGit(["show", "--find-renames", "--numstat", "--format=", commitHash], { cwd: repository.path }),
    runGit(["show", "--find-renames", "--name-status", "--format=", commitHash], { cwd: repository.path }),
    runGit(["show", "--find-renames", "--format=", commitHash], { cwd: repository.path }),
  ]);

  if (!metaRes.ok) throw new GitHostError("git_command_failed", text(metaRes.stderr, "Failed to read commit metadata."));
  if (!messageRes.ok) throw new GitHostError("git_command_failed", text(messageRes.stderr, "Failed to read commit message."));
  if (!numstatRes.ok) throw new GitHostError("git_command_failed", text(numstatRes.stderr, "Failed to read commit diff."));
  if (!nameStatusRes.ok) throw new GitHostError("git_command_failed", text(nameStatusRes.stderr, "Failed to read commit files."));
  if (!diffRes.ok) throw new GitHostError("git_command_failed", text(diffRes.stderr, "Failed to read commit diff."));

  const files = withFileStats(parseNameStatusOutput(nameStatusRes.stdout), parseNumstatOutput(numstatRes.stdout));
  const totals = summarizeFileLines(files);

  return {
    commit: {
      ...parseCommitMeta(metaRes.stdout),
      message: String(messageRes.stdout || "").trim(),
    },
    files,
    diff: String(diffRes.stdout || ""),
    file_count: files.length,
    lines_added: totals.lines_added,
    lines_removed: totals.lines_removed,
  };
}

async function readRepositoryCompare(
  repository: GitRepositoryHandle,
  options: {
    baseRef?: string;
    headRef?: string;
  },
): Promise<GitCompareSummary> {
  await assertRepositoryReady(repository);
  const base = await resolveCommitForRef(repository.path, options && options.baseRef, "Base branch or ref does not exist.");
  const head = await resolveCommitForRef(repository.path, options && options.headRef, "Head branch or ref does not exist.");
  const range = `${base.ref}...${head.ref}`;
  const commitRange = `${base.ref}..${head.ref}`;

  const [numstatRes, nameStatusRes, diffRes, logRes, mergeBaseRes] = await Promise.all([
    runGit(["diff", "--find-renames", "--numstat", range], { cwd: repository.path }),
    runGit(["diff", "--find-renames", "--name-status", range], { cwd: repository.path }),
    runGit(["diff", "--find-renames", range], { cwd: repository.path }),
    runGit(
      ["log", commitRange, "--date=iso-strict", "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s"],
      { cwd: repository.path },
    ),
    runGit(["merge-base", base.ref, head.ref], { cwd: repository.path }),
  ]);

  if (!numstatRes.ok) throw new GitHostError("git_command_failed", text(numstatRes.stderr, "Failed to read compare diff."));
  if (!nameStatusRes.ok) throw new GitHostError("git_command_failed", text(nameStatusRes.stderr, "Failed to read compare files."));
  if (!diffRes.ok) throw new GitHostError("git_command_failed", text(diffRes.stderr, "Failed to read compare diff."));
  if (!logRes.ok) throw new GitHostError("git_command_failed", text(logRes.stderr, "Failed to read compare commits."));

  const files = withFileStats(parseNameStatusOutput(nameStatusRes.stdout), parseNumstatOutput(numstatRes.stdout));
  const commits = parseCommitLogOutput(logRes.stdout);
  const totals = summarizeFileLines(files);

  return {
    base_ref: base.ref,
    head_ref: head.ref,
    base_commit: base.commit,
    head_commit: head.commit,
    merge_base: mergeBaseRes.ok ? text(mergeBaseRes.stdout) : "",
    files,
    commits,
    diff: String(diffRes.stdout || ""),
    file_count: files.length,
    commit_count: commits.length,
    lines_added: totals.lines_added,
    lines_removed: totals.lines_removed,
    has_changes: Boolean(files.length || commits.length),
  };
}

export { listRepositoryTree, readRepositoryBlob, readRepositoryCommit, readRepositoryCompare };
