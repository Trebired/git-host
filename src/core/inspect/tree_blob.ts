import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  GitBlob,
  GitLinguistProgressEvent,
  GitRepositoryHandle,
  GitTreeEntry,
} from "#1mbdfxwwqqpa";
import { normalizeRepositoryRelativePath } from "#ynrrpw9yaztf";
import { text } from "#sy81xkgkmoa0";
import { resolveTreeEntryIcon } from "./icon_theme.js";
import { readRepositoryLinguist, readRepositoryTreeEntries } from "./linguist.js";
import { runGit, runGitBuffer } from "#96b00569f1f4";
import { assertRepositoryReady, decodeBlobContent } from "./helpers.js";

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
    ...(options.linguist === true
      ? { language: linguist && Object.prototype.hasOwnProperty.call(linguist.files.results, entry.path) ? linguist.files.results[entry.path] : null }
      : {}),
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
    throw new GitHostError("path_not_found", text(revRes.stderr, "Blob does not exist."), {
      path: blobPath,
      ref,
      repositoryId: repository.id,
    });
  }
  if (!typeRes.ok || text(typeRes.stdout) !== "blob") {
    throw new GitHostError("path_not_blob", text(typeRes.stderr, "Requested path is not a blob."), {
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

export { listRepositoryTree, readRepositoryBlob, readRepositoryLinguist, readRepositoryTreeEntries };
