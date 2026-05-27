import analyseRawContent from "linguist-js/dist/entry/analyseRaw.js";

import { GitHostError, isGitHostError } from "../errors.js";
import type {
  GitArchive,
  GitBlob,
  GitBlame,
  GitBlameLine,
  GitCommitDetail,
  GitCompareSummary,
  GitLinguistProgressEvent,
  GitRepositoryHandle,
  GitRepositoryLinguist,
  GitRepositoryLinguistLanguage,
  GitSearchFileResult,
  GitSearchResult,
  GitTreeEntry,
} from "../types.js";
import { normalizeRepositoryRelativePath } from "../utils/paths.js";
import { text } from "../utils/text.js";
import { resolveTreeEntryIcon } from "./inspect/icon_theme.js";
import { createLinguistProgressReporter } from "./inspect/linguist_progress.js";
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

type LinguistAnalysisResult = Awaited<ReturnType<typeof analyseRawContent>>;

function normalizeOptionalPath(value: unknown): string {
  const raw = text(value);
  return raw ? normalizeRepositoryRelativePath(raw) : "";
}

function formatGitTimestamp(epochSecondsInput: unknown, timezoneInput: unknown): string {
  const epochSeconds = Number(epochSecondsInput);
  const timezone = text(timezoneInput);
  if (!Number.isFinite(epochSeconds) || !timezone || !/^[+-]\d{4}$/.test(timezone)) {
    return "";
  }

  const sign = timezone.startsWith("-") ? -1 : 1;
  const hours = Number(timezone.slice(1, 3)) || 0;
  const minutes = Number(timezone.slice(3, 5)) || 0;
  const offsetMinutes = sign * ((hours * 60) + minutes);
  const shifted = new Date((epochSeconds + (offsetMinutes * 60)) * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  const second = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${timezone.slice(0, 3)}:${timezone.slice(3, 5)}`;
}

function sanitizeFileComponent(value: string): string {
  return text(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "snapshot";
}

async function readRepositoryTreeEntries(
  repository: GitRepositoryHandle,
  options: {
    path?: string;
    recursive?: boolean;
    ref?: string;
  } = {},
): Promise<GitTreeEntry[]> {
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

async function readTreeEntryBlob(repository: GitRepositoryHandle, ref: string, entry: GitTreeEntry): Promise<GitBlob> {
  const objectSpec = `${ref}:${entry.path}`;
  const contentRes = await runGitBuffer(["show", objectSpec], { cwd: repository.path });
  if (!contentRes.ok) {
    throw new GitHostError("git_command_failed", text(contentRes.stderr, "Failed to read blob content."), {
      path: entry.path,
      ref,
      repositoryId: repository.id,
    });
  }

  return {
    object: entry.object,
    path: entry.path,
    ref,
    size: entry.size == null ? 0 : entry.size,
    ...decodeBlobContent(contentRes.stdout),
  };
}

async function readRepositoryLinguistInput(
  repository: GitRepositoryHandle,
  ref: string,
  onProgress?: ReturnType<typeof createLinguistProgressReporter>["emit"],
): Promise<{
  input: Record<string, string>;
  total_blobs: number;
  total_entries: number;
}> {
  const entries = await readRepositoryTreeEntries(repository, { recursive: true, ref });
  const blobEntries = entries.filter((entry) => entry.type === "blob");
  const input: Record<string, string> = {};
  let processedBlobs = 0;

  if (onProgress) {
    await onProgress("reading_blobs", {
      processed_blobs: 0,
      total_blobs: blobEntries.length,
      total_entries: entries.length,
    });
  }

  for (let index = 0; index < blobEntries.length; index += 16) {
    const chunk = blobEntries.slice(index, index + 16);
    const blobs = await Promise.all(chunk.map(async (entry) => {
      return await readTreeEntryBlob(repository, ref, entry);
    }));

    for (const blob of blobs) {
      if (!blob.is_binary && blob.encoding === "utf8") {
        input[blob.path] = blob.content;
      }
    }

    processedBlobs += chunk.length;
    if (onProgress) {
      await onProgress("reading_blobs", {
        processed_blobs: processedBlobs,
        total_blobs: blobEntries.length,
        total_entries: entries.length,
      });
    }
  }

  return {
    input,
    total_blobs: blobEntries.length,
    total_entries: entries.length,
  };
}

function normalizeLinguistLanguage(
  language: unknown,
  value: {
    bytes?: number;
    count?: number;
    lines?: {
      content?: number;
      total?: number;
    };
  },
  repositoryMetadata: Record<string, { color?: string; parent?: string; type?: string }>,
): GitRepositoryLinguistLanguage {
  const name = text(language);
  const metadata = repositoryMetadata[name] || {};
  return {
    bytes: Number(value && value.bytes) || 0,
    color: text(metadata.color) || undefined,
    count: Number(value && value.count) || 0,
    lines: {
      content: Number(value && value.lines && value.lines.content) || 0,
      total: Number(value && value.lines && value.lines.total) || 0,
    },
    parent: text(metadata.parent) || undefined,
    type: text(metadata.type),
  };
}

function normalizeLinguistResults(
  result: LinguistAnalysisResult,
  target: { commit: string; ref: string },
): GitRepositoryLinguist {
  const repositoryMetadata = result.repository || {};

  return {
    commit: target.commit,
    files: {
      bytes: Number(result.files && result.files.bytes) || 0,
      count: Number(result.files && result.files.count) || 0,
      lines: {
        content: Number(result.files && result.files.lines && result.files.lines.content) || 0,
        total: Number(result.files && result.files.lines && result.files.lines.total) || 0,
      },
      results: Object.fromEntries(Object.entries(result.files && result.files.results ? result.files.results : {}).map(([filePath, language]) => [
        text(filePath),
        language == null ? null : text(language),
      ])),
    },
    languages: {
      bytes: Number(result.languages && result.languages.bytes) || 0,
      count: Number(result.languages && result.languages.count) || 0,
      lines: {
        content: Number(result.languages && result.languages.lines && result.languages.lines.content) || 0,
        total: Number(result.languages && result.languages.lines && result.languages.lines.total) || 0,
      },
      results: Object.fromEntries(
        Object.entries(result.languages && result.languages.results ? result.languages.results : {}).map(([language, value]) => [
          text(language),
          normalizeLinguistLanguage(language, value || {}, repositoryMetadata),
        ]),
      ),
    },
    ref: target.ref,
    unknown: {
      bytes: Number(result.unknown && result.unknown.bytes) || 0,
      count: Number(result.unknown && result.unknown.count) || 0,
      extensions: Object.fromEntries(
        Object.entries(result.unknown && result.unknown.extensions ? result.unknown.extensions : {}).map(([extension, bytes]) => [
          text(extension),
          Number(bytes) || 0,
        ]),
      ),
      filenames: Object.fromEntries(
        Object.entries(result.unknown && result.unknown.filenames ? result.unknown.filenames : {}).map(([fileName, bytes]) => [
          text(fileName),
          Number(bytes) || 0,
        ]),
      ),
      lines: {
        content: Number(result.unknown && result.unknown.lines && result.unknown.lines.content) || 0,
        total: Number(result.unknown && result.unknown.lines && result.unknown.lines.total) || 0,
      },
    },
  };
}

async function readRepositoryLinguist(
  repository: GitRepositoryHandle,
  options: {
    onProgress?: (event: GitLinguistProgressEvent) => Promise<void> | void;
    ref?: string;
  } = {},
): Promise<GitRepositoryLinguist> {
  await assertRepositoryReady(repository);
  const progress = createLinguistProgressReporter({
    onProgress: options.onProgress,
    ref: text(options.ref, "HEAD"),
    repository,
  });
  let target = {
    commit: "",
    ref: text(options.ref, "HEAD"),
  };

  try {
    await progress.emit("queued");
    await progress.emit("resolving_ref", { ref: target.ref });
    target = await resolveCommitForRef(repository.path, target.ref, "Repository ref does not exist.");
    await progress.emit("listing_tree", { commit: target.commit, ref: target.ref });
    const linguistInput = await readRepositoryLinguistInput(repository, target.ref, progress.emit);
    await progress.emit("analyzing", {
      commit: target.commit,
      processed_blobs: linguistInput.total_blobs,
      ref: target.ref,
      total_blobs: linguistInput.total_blobs,
      total_entries: linguistInput.total_entries,
    });
    const result = await analyseRawContent(linguistInput.input, { offline: true });
    const normalized = normalizeLinguistResults(result, target);
    await progress.emit("completed", {
      commit: target.commit,
      processed_blobs: linguistInput.total_blobs,
      ref: target.ref,
      total_blobs: linguistInput.total_blobs,
      total_entries: linguistInput.total_entries,
    });
    return normalized;
  } catch (error) {
    await progress.emit("failed", {
      commit: text(target.commit) || undefined,
      error: {
        code: isGitHostError(error) ? error.code : (error instanceof Error ? "internal_error" : "internal_error"),
        message: error instanceof Error ? error.message : "Linguist scan failed.",
      },
      ref: target.ref,
    }).catch(() => {
      return undefined;
    });
    throw error;
  }
}

async function listRepositoryTree(
  repository: GitRepositoryHandle,
  options: {
    icons?: boolean;
    linguist?: boolean;
    onLinguistProgress?: (event: GitLinguistProgressEvent) => Promise<void> | void;
    path?: string;
    recursive?: boolean;
    ref?: string;
  } = {},
): Promise<GitTreeEntry[]> {
  await assertRepositoryReady(repository);
  const ref = text(options.ref, "HEAD");
  const entries = await readRepositoryTreeEntries(repository, {
    path: options.path,
    recursive: options.recursive,
    ref,
  });
  if (options.icons !== true && options.linguist !== true) return entries;

  const linguist = options.linguist === true
    ? await readRepositoryLinguist(repository, {
      onProgress: options.onLinguistProgress,
      ref,
    })
    : null;

  return entries.map((entry) => ({
    ...entry,
    ...(options.icons === true ? { icon: resolveTreeEntryIcon(entry) } : {}),
    ...(options.linguist === true ? { language: linguist && Object.prototype.hasOwnProperty.call(linguist.files.results, entry.path) ? linguist.files.results[entry.path] : null } : {}),
  }));
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
    format?: "tar" | "zip";
    prefix?: string;
    ref?: string;
  } = {},
): Promise<GitArchive> {
  await assertRepositoryReady(repository);
  const target = await resolveCommitForRef(repository.path, text(options.ref, "HEAD"), "Archive ref does not exist.");
  const format = text(options.format, "tar") === "zip" ? "zip" : "tar";
  const prefix = text(options.prefix, `${sanitizeFileComponent(repository.id)}-${sanitizeFileComponent(target.ref)}/`);
  const archiveRes = await runGitBuffer(["archive", `--format=${format}`, `--prefix=${prefix}`, target.ref], {
    cwd: repository.path,
  });
  if (!archiveRes.ok) {
    throw new GitHostError("git_command_failed", text(archiveRes.stderr, "Failed to create repository archive."), {
      format,
      ref: target.ref,
      repositoryId: repository.id,
    });
  }

  return {
    content: archiveRes.stdout.toString("base64"),
    content_type: format === "zip" ? "application/zip" : "application/x-tar",
    encoding: "base64",
    file_name: `${sanitizeFileComponent(repository.id)}-${sanitizeFileComponent(target.ref)}.${format}`,
    format,
    ref: target.ref,
    size: archiveRes.stdout.byteLength,
  };
}

export {
  listRepositoryTree,
  readRepositoryArchive,
  readRepositoryBlame,
  readRepositoryBlob,
  readRepositoryCommit,
  readRepositoryCompare,
  readRepositoryLinguist,
  searchRepository,
};
