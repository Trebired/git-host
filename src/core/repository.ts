import { DEFAULT_BRANCH } from "../constants.js";
import type { GitBranchSummary, GitCommitSummary, GitRemoteSummary, GitRepositoryHandle, GitRepositoryStatus, GitRepositorySummary } from "../types.js";
import { text } from "../utils/text.js";
import { readRepositoryOperationState } from "./operation_state.js";
import { repositoryExists, runGit } from "./run_git.js";
import {
  parseBranchesOutput,
  parseCommitLogOutput,
  parseNameStatusOutput,
  parseNumstatOutput,
  parseRemotesOutput,
  parseStatusOutput,
} from "./repository/parsers.js";

async function readRepositoryStatus(workspaceRoot: string): Promise<GitRepositoryStatus> {
  const statusRes = await runGit(["status", "--porcelain=v1", "--branch"], { cwd: workspaceRoot });
  if (!statusRes.ok) throw new Error(text(statusRes.stderr, "Failed to read repository status."));

  return {
    ...parseStatusOutput(statusRes.stdout),
    operation: readRepositoryOperationState(workspaceRoot),
  };
}

async function readRepositoryBranches(workspaceRoot: string): Promise<GitBranchSummary[]> {
  const branchRes = await runGit(
    ["for-each-ref", "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(objectname)", "refs/heads"],
    { cwd: workspaceRoot },
  );
  if (!branchRes.ok) throw new Error(text(branchRes.stderr, "Failed to read repository branches."));
  return parseBranchesOutput(branchRes.stdout);
}

async function readRepositoryRemotes(workspaceRoot: string): Promise<GitRemoteSummary[]> {
  const remoteRes = await runGit(["remote", "-v"], { cwd: workspaceRoot });
  if (!remoteRes.ok) throw new Error(text(remoteRes.stderr, "Failed to read repository remotes."));
  return parseRemotesOutput(remoteRes.stdout);
}

async function readRepositoryCommits(workspaceRoot: string, limit = 10): Promise<GitCommitSummary[]> {
  const logRes = await runGit(
    ["log", `--max-count=${Math.max(1, Number(limit) || 10)}`, "--date=iso-strict", "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s"],
    { cwd: workspaceRoot },
  );
  if (!logRes.ok) {
    const stderr = text(logRes.stderr);
    if (stderr.includes("does not have any commits yet") || stderr.includes("unknown revision or path not in the working tree")) return [];
    throw new Error(stderr || "Failed to read repository history.");
  }
  return parseCommitLogOutput(logRes.stdout);
}

async function readRepositoryHead(workspaceRoot: string) {
  const branchRes = await runGit(["symbolic-ref", "--short", "HEAD"], { cwd: workspaceRoot });
  const fallbackBranchRes = branchRes.ok ? branchRes : await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: workspaceRoot });
  const headRes = await runGit(["rev-parse", "HEAD"], { cwd: workspaceRoot });
  const shortHeadRes = await runGit(["rev-parse", "--short", "HEAD"], { cwd: workspaceRoot });
  const originHeadRes = await runGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: workspaceRoot });

  return {
    current_branch: fallbackBranchRes.ok ? text(fallbackBranchRes.stdout) : "",
    default_branch: originHeadRes.ok
      ? text(originHeadRes.stdout).replace(/^origin\//, "") || DEFAULT_BRANCH
      : (fallbackBranchRes.ok ? text(fallbackBranchRes.stdout) : DEFAULT_BRANCH),
    head_commit: headRes.ok ? text(headRes.stdout) : "",
    head_short: shortHeadRes.ok ? text(shortHeadRes.stdout) : "",
  };
}

async function buildRepositorySummary(repository: GitRepositoryHandle, options: { commitLimit?: number } = {}): Promise<GitRepositorySummary> {
  const hasRepo = await repositoryExists(repository.path);
  if (!hasRepo) throw new Error("Repository is not initialized.");

  const [status, branches, remotes, commits, head] = await Promise.all([
    readRepositoryStatus(repository.path),
    readRepositoryBranches(repository.path),
    readRepositoryRemotes(repository.path),
    readRepositoryCommits(repository.path, options.commitLimit || 10),
    readRepositoryHead(repository.path),
  ]);
  const origin = remotes.find((entry) => text(entry.name) === "origin");

  return {
    branches,
    commits,
    remotes,
    repository: {
      current_branch: head.current_branch,
      default_branch: head.default_branch,
      head_commit: head.head_commit,
      head_short: head.head_short,
      id: repository.id,
      path: repository.path,
      remote_origin_url: origin ? text(origin.fetch_url) : "",
    },
    status,
  };
}

export {
  buildRepositorySummary,
  parseCommitLogOutput,
  parseNameStatusOutput,
  parseNumstatOutput,
  readRepositoryBranches,
  readRepositoryCommits,
  readRepositoryRemotes,
  readRepositoryStatus,
};
