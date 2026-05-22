import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
  DEFAULT_MANAGED_EXCLUDE_HEADER,
  DEFAULT_MANAGED_EXCLUDE_PATTERNS,
} from "../../constants.js";
import type { GitActor, GitCommandResult } from "../../types.js";
import { text } from "../../utils/text.js";
import { buildGitEnv } from "./env.js";
import { runGit } from "./process.js";

async function repositoryExists(workspaceRoot: string): Promise<boolean> {
  if (!fs.existsSync(workspaceRoot)) return false;
  const probe = await runGit(["rev-parse", "--git-dir"], { cwd: workspaceRoot });
  return probe.ok && Boolean(text(probe.stdout));
}

function isDirectoryEmpty(dirPath: string): boolean {
  try {
    return fs.readdirSync(dirPath).length === 0;
  } catch {
    return false;
  }
}

function workspaceHasTrackableFiles(workspaceRoot: string): boolean {
  try {
    return fs.readdirSync(workspaceRoot).some((entry) => entry && entry !== ".git");
  } catch {
    return false;
  }
}

async function initRepository(workspaceRoot: string, initialBranch = DEFAULT_BRANCH): Promise<GitCommandResult> {
  let initRes = await runGit(["init", "--initial-branch", text(initialBranch, DEFAULT_BRANCH)], { cwd: workspaceRoot });
  if (!initRes.ok) {
    initRes = await runGit(["init"], { cwd: workspaceRoot });
    if (!initRes.ok) return initRes;
    const branchRes = await runGit(["symbolic-ref", "HEAD", `refs/heads/${text(initialBranch, DEFAULT_BRANCH)}`], { cwd: workspaceRoot });
    if (!branchRes.ok) return branchRes;
  }
  return initRes;
}

async function ensureHostedRepositoryConfig(workspaceRoot: string): Promise<GitCommandResult> {
  for (const args of [
    ["config", "receive.denyCurrentBranch", "updateInstead"],
    ["config", "http.receivepack", "true"],
    ["config", "http.uploadpack", "true"],
  ]) {
    const res = await runGit(args, { cwd: workspaceRoot });
    if (!res.ok) return res;
  }

  return { code: 0, ok: true, stderr: "", stdout: "" };
}

async function ensureManagedExcludeFile(workspaceRoot: string, options: { header?: string; patterns?: string[] } = {}) {
  const header = text(options.header, DEFAULT_MANAGED_EXCLUDE_HEADER);
  const patterns = Array.isArray(options.patterns) && options.patterns.length
    ? options.patterns.map((entry) => text(entry)).filter(Boolean)
    : Array.from(DEFAULT_MANAGED_EXCLUDE_PATTERNS);

  const infoDir = path.join(workspaceRoot, ".git", "info");
  const excludePath = path.join(infoDir, "exclude");
  fs.mkdirSync(infoDir, { recursive: true });

  let current = "";
  try {
    current = fs.readFileSync(excludePath, "utf8");
  } catch {}

  const lines = current ? current.split(/\r?\n/) : [];
  const next = lines.slice();
  if (!lines.some((line) => line.trim() === header)) {
    if (next.length && next[next.length - 1].trim()) next.push("");
    next.push(header);
  }
  for (const pattern of patterns) {
    if (!next.some((line) => line.trim() === pattern)) next.push(pattern);
  }

  fs.writeFileSync(excludePath, `${next.join("\n").replace(/\n+$/g, "")}\n`, "utf8");
}

async function createInitialCommit(workspaceRoot: string, actor: GitActor | null, message = DEFAULT_COMMIT_MESSAGE): Promise<GitCommandResult> {
  const addRes = await runGit(["add", "-A"], {
    cwd: workspaceRoot,
    env: buildGitEnv({ actor }),
  });
  if (!addRes.ok) return addRes;

  const statusRes = await runGit(["status", "--porcelain=v1", "--branch"], { cwd: workspaceRoot });
  if (!statusRes.ok) return statusRes;

  const clean = statusRes.stdout.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).length === 0;
  if (clean) return { code: 0, ok: true, stderr: "", stdout: "" };

  return await runGit(["commit", "-m", text(message, DEFAULT_COMMIT_MESSAGE)], {
    cwd: workspaceRoot,
    env: buildGitEnv({ actor }),
  });
}

async function cloneRepository(input: {
  cloneUrl: string;
  remoteUrl?: string;
  workspaceRoot: string;
  args?: string[];
  env?: Record<string, string>;
}): Promise<GitCommandResult> {
  const cloneUrl = text(input.cloneUrl);
  const remoteUrl = text(input.remoteUrl) || cloneUrl;
  const workspaceRoot = text(input.workspaceRoot);
  const args = Array.isArray(input.args) ? input.args : [];

  const cloneRes = await runGit([...args, "clone", "--origin", "origin", cloneUrl, workspaceRoot], {
    cwd: path.dirname(workspaceRoot),
    env: input.env,
  });
  if (!cloneRes.ok) return cloneRes;
  if (remoteUrl && remoteUrl !== cloneUrl) {
    const remoteRes = await runGit(["remote", "set-url", "origin", remoteUrl], { cwd: workspaceRoot });
    if (!remoteRes.ok) return remoteRes;
  }
  return cloneRes;
}

export {
  cloneRepository,
  createInitialCommit,
  ensureHostedRepositoryConfig,
  ensureManagedExcludeFile,
  initRepository,
  isDirectoryEmpty,
  repositoryExists,
  workspaceHasTrackableFiles,
};
