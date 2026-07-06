import { GitHostError } from "#ebw9yuqcyi9w";
import type { GitBlame, GitBlameLine, GitCommitDetail, GitCompareSummary, GitRepositoryHandle } from "#1mbdfxwwqqpa";
import { normalizeRepositoryRelativePath } from "#ynrrpw9yaztf";
import { text } from "#sy81xkgkmoa0";
import { parseCommitLogOutput, parseNameStatusOutput, parseNumstatOutput } from "#1fu49obi0gq3";
import { runGit } from "#96b00569f1f4";
import {
  assertRepositoryReady,
  parseCommitMeta,
  resolveCommitForRef,
  summarizeFileLines,
  withFileStats,
} from "./helpers.js";
import { formatGitTimestamp, normalizeOptionalPath } from "./shared.js";

async function readRepositoryCommitArtifacts(repository: GitRepositoryHandle, commitHash: string) {
  return await Promise.all([
    runGit(
      ["show", "--quiet", "--date=iso-strict", "--format=%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s", commitHash],
      { cwd: repository.path },
    ),
    runGit(["show", "--quiet", "--format=%B", commitHash], { cwd: repository.path }),
    runGit(["show", "--find-renames", "--numstat", "--format=", commitHash], { cwd: repository.path }),
    runGit(["show", "--find-renames", "--name-status", "--format=", commitHash], { cwd: repository.path }),
    runGit(["show", "--find-renames", "--format=", commitHash], { cwd: repository.path }),
  ]);
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
  const [metaRes, messageRes, numstatRes, nameStatusRes, diffRes] = await readRepositoryCommitArtifacts(repository, commitHash);

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
    diff: String(diffRes.stdout || ""),
    file_count: files.length,
    files,
    lines_added: totals.lines_added,
    lines_removed: totals.lines_removed,
  };
}

async function readRepositoryCompare(
  repository: GitRepositoryHandle,
  options: {
    baseRef?: string;
    headRef?: string;
    path?: string;
  },
): Promise<GitCompareSummary> {
  await assertRepositoryReady(repository);
  const base = await resolveCommitForRef(repository.path, options && options.baseRef, "Base branch or ref does not exist.");
  const head = await resolveCommitForRef(repository.path, options && options.headRef, "Head branch or ref does not exist.");
  const range = `${base.ref}...${head.ref}`;
  const commitRange = `${base.ref}..${head.ref}`;
  const path = normalizeOptionalPath(options && options.path);

  const diffNumstatArgs = ["diff", "--find-renames", "--numstat", range];
  const diffNameStatusArgs = ["diff", "--find-renames", "--name-status", range];
  const diffArgs = ["diff", "--find-renames", range];
  const logArgs = ["log", commitRange, "--date=iso-strict", "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s"];
  if (path) {
    diffNumstatArgs.push("--", path);
    diffNameStatusArgs.push("--", path);
    diffArgs.push("--", path);
    logArgs.push("--", path);
  }

  const [numstatRes, nameStatusRes, diffRes, logRes, mergeBaseRes] = await Promise.all([
    runGit(diffNumstatArgs, { cwd: repository.path }),
    runGit(diffNameStatusArgs, { cwd: repository.path }),
    runGit(diffArgs, { cwd: repository.path }),
    runGit(logArgs, { cwd: repository.path }),
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
    base_commit: base.commit,
    base_ref: base.ref,
    commit_count: commits.length,
    commits,
    diff: String(diffRes.stdout || ""),
    file_count: files.length,
    files,
    has_changes: Boolean(files.length || commits.length),
    head_commit: head.commit,
    head_ref: head.ref,
    lines_added: totals.lines_added,
    lines_removed: totals.lines_removed,
    merge_base: mergeBaseRes.ok ? text(mergeBaseRes.stdout) : "",
  };
}

async function readRepositoryBlame(
  repository: GitRepositoryHandle,
  options: {
    path?: string;
    ref?: string;
  },
): Promise<GitBlame> {
  await assertRepositoryReady(repository);
  const ref = text(options && options.ref, "HEAD");
  const filePath = normalizeRepositoryRelativePath(options && options.path);
  const blameRes = await runGit(["blame", "--line-porcelain", ref, "--", filePath], { cwd: repository.path });
  if (!blameRes.ok) {
    throw new GitHostError("git_command_failed", text(blameRes.stderr, "Failed to read blame information."), {
      path: filePath,
      ref,
      repositoryId: repository.id,
    });
  }

  const rows = String(blameRes.stdout || "").split(/\r?\n/);
  const lines: GitBlameLine[] = [];
  let current: (GitBlameLine & { author_tz?: string }) | null = null;

  for (const row of rows) {
    if (!row) continue;
    const header = row.match(/^([0-9a-f]{40}) (\d+) (\d+) (\d+)$/);
    if (header) {
      current = {
        author_email: "",
        author_name: "",
        authored_at: "",
        author_tz: "",
        commit_hash: text(header[1]),
        commit_short_hash: text(header[1]).slice(0, 7),
        content: "",
        line_number: Number(header[3]) || 0,
        original_line_number: Number(header[2]) || 0,
        summary: "",
      };
      continue;
    }

    if (!current) continue;
    if (row.startsWith("author ")) current.author_name = row.slice("author ".length);
    else if (row.startsWith("author-mail ")) current.author_email = row.slice("author-mail ".length).replace(/^<|>$/g, "");
    else if (row.startsWith("author-time ")) current.authored_at = row.slice("author-time ".length);
    else if (row.startsWith("author-tz ")) current.author_tz = row.slice("author-tz ".length);
    else if (row.startsWith("summary ")) current.summary = row.slice("summary ".length);
    else if (row.startsWith("\t")) {
      current.content = row.slice(1);
      lines.push({
        author_email: current.author_email,
        author_name: current.author_name,
        authored_at: formatGitTimestamp(current.authored_at, current.author_tz),
        commit_hash: current.commit_hash,
        commit_short_hash: current.commit_short_hash,
        content: current.content,
        line_number: current.line_number,
        original_line_number: current.original_line_number,
        summary: current.summary,
      });
      current = null;
    }
  }

  return {
    lines,
    path: filePath,
    ref,
  };
}

export { readRepositoryBlame, readRepositoryCommit, readRepositoryCompare };
