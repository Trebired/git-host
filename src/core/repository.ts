import { DEFAULT_BRANCH } from "../constants.js";
import type {
  GitBranchSummary,
  GitCommitSummary,
  GitRemoteSummary,
  GitRepositoryHandle,
  GitRepositoryStatus,
  GitRepositorySummary,
  GitTagDetail,
  GitTagSummary,
  ListCommitsOptions,
} from "../types.js";
import { normalizeRepositoryRelativePath } from "../utils/paths.js";
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
  parseTagsOutput,
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

function normalizeOptionalPath(value: unknown): string {
  const raw = text(value);
  return raw ? normalizeRepositoryRelativePath(raw) : "";
}

const TAG_FIELD_SEPARATOR = "\u001f";
const TAG_FORMAT = `--format=%(refname:short)${TAG_FIELD_SEPARATOR}%(objectname)${TAG_FIELD_SEPARATOR}%(objectname:short)${TAG_FIELD_SEPARATOR}%(objecttype)${TAG_FIELD_SEPARATOR}%(taggername)${TAG_FIELD_SEPARATOR}%(taggeremail:trim)${TAG_FIELD_SEPARATOR}%(taggerdate:iso-strict)${TAG_FIELD_SEPARATOR}%(subject)${TAG_FIELD_SEPARATOR}%(*objectname)${TAG_FIELD_SEPARATOR}%(*objectname:short)${TAG_FIELD_SEPARATOR}%(*objecttype)`;

async function readRepositoryCommits(workspaceRoot: string, options: ListCommitsOptions = {}): Promise<GitCommitSummary[]> {
  const args = [
    "log",
    text(options.ref, "HEAD"),
    `--max-count=${Math.max(1, Number(options.limit) || 10)}`,
    "--date=iso-strict",
    "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s",
  ];
  const path = normalizeOptionalPath(options.path);
  if (path) args.push("--", path);

  const logRes = await runGit(args, { cwd: workspaceRoot });
  if (!logRes.ok) {
    const stderr = text(logRes.stderr);
    if (stderr.includes("does not have any commits yet") || stderr.includes("unknown revision or path not in the working tree")) return [];
    throw new Error(stderr || "Failed to read repository history.");
  }
  return parseCommitLogOutput(logRes.stdout);
}

async function readRepositoryTags(workspaceRoot: string): Promise<GitTagSummary[]> {
  const tagRes = await runGit(
    [
      "for-each-ref",
      "--sort=-creatordate",
      TAG_FORMAT,
      "refs/tags",
    ],
    { cwd: workspaceRoot },
  );
  if (!tagRes.ok) throw new Error(text(tagRes.stderr, "Failed to read repository tags."));
  return parseTagsOutput(tagRes.stdout);
}

async function readRepositoryTag(workspaceRoot: string, tagNameInput: unknown): Promise<GitTagDetail> {
  const tagName = text(tagNameInput);
  if (!tagName) throw new Error("Tag name is required.");

  const [tagRes, catRes] = await Promise.all([
    runGit(
      [
        "for-each-ref",
        TAG_FORMAT,
        `refs/tags/${tagName}`,
      ],
      { cwd: workspaceRoot },
    ),
    runGit(["cat-file", "-p", `refs/tags/${tagName}`], { cwd: workspaceRoot }),
  ]);
  const summary = parseTagsOutput(tagRes.stdout)[0];
  if (!tagRes.ok || !summary) {
    throw new Error(text(tagRes.stderr, "Tag does not exist."));
  }

  let message = "";
  if (summary.annotated) {
    const body = String(catRes.stdout || "");
    const parts = body.split(/\r?\n\r?\n/);
    message = parts.length > 1 ? parts.slice(1).join("\n\n").trim() : "";
  }

  return {
    ...summary,
    message,
  };
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
    readRepositoryCommits(repository.path, { limit: options.commitLimit || 10 }),
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
  readRepositoryTag,
  readRepositoryTags,
};
