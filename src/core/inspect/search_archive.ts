import { createGitArchiveService } from "#07a96afa0a48";
import { GitHostError } from "#ebw9yuqcyi9w";
import type { GitArchive, GitRepositoryHandle, GitSearchFileResult, GitSearchResult } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { runGitBuffer } from "#96b00569f1f4";
import { assertRepositoryReady, resolveCommitForRef } from "./helpers.js";
import { normalizeOptionalPath } from "./shared.js";

const silentArchiveLogger = {
  error() {},
  fail() {},
  info() {},
  warn() {},
} as any;

const repositoryArchiveService = createGitArchiveService({
  logger: silentArchiveLogger,
});

async function searchRepository(
  repository: GitRepositoryHandle,
  options: {
    caseSensitive?: boolean;
    limit?: number;
    path?: string;
    query?: string;
    ref?: string;
    regexp?: boolean;
  },
): Promise<GitSearchResult> {
  await assertRepositoryReady(repository);
  const query = text(options && options.query);
  if (!query) {
    throw new GitHostError("git_command_failed", "Search query is required.", {
      repositoryId: repository.id,
    });
  }

  const target = await resolveCommitForRef(repository.path, text(options && options.ref, "HEAD"), "Search ref does not exist.");
  const path = normalizeOptionalPath(options && options.path);
  const limit = Number(options && options.limit) > 0 ? Number(options && options.limit) : 0;
  const args = ["grep", "-n", "--column", "-z", "-I", "--full-name"];
  if (options && options.caseSensitive === false) args.push("-i");
  if (!options || options.regexp !== true) args.push("-F");
  args.push("-e", query, target.ref);
  if (path) args.push("--", path);

  const grepRes = await runGitBuffer(args, { cwd: repository.path });
  if (!grepRes.ok && grepRes.code !== 1) {
    throw new GitHostError("git_command_failed", text(grepRes.stderr, "Failed to search repository."), {
      path,
      query,
      ref: target.ref,
      repositoryId: repository.id,
    });
  }

  const tokens = grepRes.stdout.toString("utf8").split("\0").filter((entry) => entry !== "");
  const parsed: Array<{ column: number; line: string; line_number: number; path: string }> = [];
  for (let index = 0; index + 3 < tokens.length; index += 4) {
    const pathToken = tokens[index] || "";
    const lineNumber = Number(tokens[index + 1]) || 0;
    const column = Number(tokens[index + 2]) || 0;
    const line = String(tokens[index + 3] || "").replace(/\r?\n$/, "");
    const filePath = pathToken.startsWith(`${target.ref}:`) ? pathToken.slice(target.ref.length + 1) : pathToken;
    parsed.push({
      column,
      line,
      line_number: lineNumber,
      path: filePath,
    });
  }

  const totalMatches = parsed.length;
  const limited = limit > 0 ? parsed.slice(0, limit) : parsed;
  const filesMap = new Map<string, GitSearchFileResult>();
  for (const match of limited) {
    const current = filesMap.get(match.path) || {
      match_count: 0,
      matches: [],
      path: match.path,
    };
    current.match_count += 1;
    current.matches.push({
      column: match.column,
      line: match.line,
      line_number: match.line_number,
    });
    filesMap.set(match.path, current);
  }

  return {
    files: Array.from(filesMap.values()),
    match_count: limited.length,
    query,
    ref: target.ref,
    truncated: limit > 0 && totalMatches > limit,
  };
}

async function readRepositoryArchive(
  repository: GitRepositoryHandle,
  options: {
    format?: "tar" | "tar.gz" | "zip";
    prefix?: string;
    ref?: string;
  } = {},
): Promise<GitArchive> {
  return await repositoryArchiveService.read(repository, options);
}

export { readRepositoryArchive, searchRepository };
