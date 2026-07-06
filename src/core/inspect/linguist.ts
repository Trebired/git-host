import analyseRawContent from "linguist-js/dist/entry/analyseRaw.js";

import { GitHostError, isGitHostError } from "#ebw9yuqcyi9w";
import type {
  GitBlob,
  GitLinguistProgressEvent,
  GitRepositoryHandle,
  GitRepositoryLinguist,
  GitRepositoryLinguistLanguage,
  GitTreeEntry,
} from "#1mbdfxwwqqpa";
import { normalizeRepositoryRelativePath } from "#ynrrpw9yaztf";
import { text } from "#sy81xkgkmoa0";
import { createLinguistProgressReporter } from "./linguist_progress.js";
import { runGitBuffer } from "#96b00569f1f4";
import {
  assertRepositoryReady,
  decodeBlobContent,
  parseLsTreeBuffer,
  resolveCommitForRef,
} from "./helpers.js";

type LinguistAnalysisResult = Awaited<ReturnType<typeof analyseRawContent>>;

async function readRepositoryTreeEntries(
  repository: GitRepositoryHandle,
  options: { path?: string; recursive?: boolean; ref?: string } = {},
): Promise<GitTreeEntry[]> {
  const ref = text(options.ref, "HEAD");
  const treePath = options.path ? normalizeRepositoryRelativePath(options.path) : "";
  const args = ["ls-tree", "-z", "-l"];
  if (options.recursive === true) args.push("-r");
  args.push(treePath ? `${ref}:${treePath}` : ref);
  const treeRes = await runGitBuffer(args, { cwd: repository.path });
  if (treeRes.ok) return parseLsTreeBuffer(treeRes.stdout, treePath);
  if (treePath) {
    const fallbackRes = await runGitBuffer(["ls-tree", "-z", "-l", ref, "--", treePath], { cwd: repository.path });
    if (fallbackRes.ok) return parseLsTreeBuffer(fallbackRes.stdout, "");
  }
  throw new GitHostError("git_command_failed", text(treeRes.stderr, "Failed to read repository tree."), {
    path: treePath,
    ref,
    repositoryId: repository.id,
  });
}

async function readTreeEntryBlob(repository: GitRepositoryHandle, ref: string, entry: GitTreeEntry): Promise<GitBlob> {
  const contentRes = await runGitBuffer(["show", `${ref}:${entry.path}`], { cwd: repository.path });
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
) {
  const entries = await readRepositoryTreeEntries(repository, { recursive: true, ref });
  const blobEntries = entries.filter((entry) => entry.type === "blob");
  const input: Record<string, string> = {};
  let processedBlobs = 0;
  if (onProgress) await onProgress("reading_blobs", { processed_blobs: 0, total_blobs: blobEntries.length, total_entries: entries.length });
  for (let index = 0; index < blobEntries.length; index += 16) {
    const blobs = await Promise.all(blobEntries.slice(index, index + 16).map(async (entry) => await readTreeEntryBlob(repository, ref, entry)));
    for (const blob of blobs) {
      if (!blob.is_binary && blob.encoding === "utf8") input[blob.path] = blob.content;
    }
    processedBlobs += blobs.length;
    if (onProgress) await onProgress("reading_blobs", { processed_blobs: processedBlobs, total_blobs: blobEntries.length, total_entries: entries.length });
  }
  return { input, total_blobs: blobEntries.length, total_entries: entries.length };
}

function normalizeLinguistLanguage(
  language: unknown,
  value: { bytes?: number; count?: number; lines?: { content?: number; total?: number } },
  repositoryMetadata: Record<string, { color?: string; parent?: string; type?: string }>,
): GitRepositoryLinguistLanguage {
  const name = text(language);
  const metadata = repositoryMetadata[name] || {};
  return {
    bytes: Number(value?.bytes) || 0,
    color: text(metadata.color) || undefined,
    count: Number(value?.count) || 0,
    lines: { content: Number(value?.lines?.content) || 0, total: Number(value?.lines?.total) || 0 },
    parent: text(metadata.parent) || undefined,
    type: text(metadata.type),
  };
}

function normalizeLinguistResults(result: LinguistAnalysisResult, target: { commit: string; ref: string }): GitRepositoryLinguist {
  const repositoryMetadata = result.repository || {};
  return {
    commit: target.commit,
    files: {
      bytes: Number(result.files?.bytes) || 0,
      count: Number(result.files?.count) || 0,
      lines: { content: Number(result.files?.lines?.content) || 0, total: Number(result.files?.lines?.total) || 0 },
      results: Object.fromEntries(Object.entries(result.files?.results || {}).map(([filePath, language]) => [text(filePath), language == null ? null : text(language)])),
    },
    languages: {
      bytes: Number(result.languages?.bytes) || 0,
      count: Number(result.languages?.count) || 0,
      lines: { content: Number(result.languages?.lines?.content) || 0, total: Number(result.languages?.lines?.total) || 0 },
      results: Object.fromEntries(Object.entries(result.languages?.results || {}).map(([language, value]) => [text(language), normalizeLinguistLanguage(language, value || {}, repositoryMetadata)])),
    },
    ref: target.ref,
    unknown: {
      bytes: Number(result.unknown?.bytes) || 0,
      count: Number(result.unknown?.count) || 0,
      extensions: Object.fromEntries(Object.entries(result.unknown?.extensions || {}).map(([extension, bytes]) => [text(extension), Number(bytes) || 0])),
      filenames: Object.fromEntries(Object.entries(result.unknown?.filenames || {}).map(([fileName, bytes]) => [text(fileName), Number(bytes) || 0])),
      lines: { content: Number(result.unknown?.lines?.content) || 0, total: Number(result.unknown?.lines?.total) || 0 },
    },
  };
}

async function readRepositoryLinguist(
  repository: GitRepositoryHandle,
  options: { onProgress?: (event: GitLinguistProgressEvent) => Promise<void> | void; ref?: string } = {},
): Promise<GitRepositoryLinguist> {
  await assertRepositoryReady(repository);
  const progress = createLinguistProgressReporter({ onProgress: options.onProgress, ref: text(options.ref, "HEAD"), repository });
  let target = { commit: "", ref: text(options.ref, "HEAD") };
  try {
    await progress.emit("queued");
    await progress.emit("resolving_ref", { ref: target.ref });
    target = await resolveCommitForRef(repository.path, target.ref, "Repository ref does not exist.");
    await progress.emit("listing_tree", { commit: target.commit, ref: target.ref });
    const linguistInput = await readRepositoryLinguistInput(repository, target.ref, progress.emit);
    await progress.emit("analyzing", { commit: target.commit, processed_blobs: linguistInput.total_blobs, ref: target.ref, total_blobs: linguistInput.total_blobs, total_entries: linguistInput.total_entries });
    const normalized = normalizeLinguistResults(await analyseRawContent(linguistInput.input, { offline: true }), target);
    await progress.emit("completed", { commit: target.commit, processed_blobs: linguistInput.total_blobs, ref: target.ref, total_blobs: linguistInput.total_blobs, total_entries: linguistInput.total_entries });
    return normalized;
  } catch (error) {
    await progress.emit("failed", {
      commit: text(target.commit) || undefined,
      error: { code: isGitHostError(error) ? error.code : "internal_error", message: error instanceof Error ? error.message : "Linguist scan failed." },
      ref: target.ref,
    }).catch(() => undefined);
    throw error;
  }
}

export {
  readRepositoryLinguist,
  readRepositoryTreeEntries,
};
