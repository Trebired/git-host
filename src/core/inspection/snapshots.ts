import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  GitDirectoryEntry,
  GitDirectorySnapshot,
  GitFileSnapshot,
  GitInspectionTargetResolved,
  GitLinguistProgressEvent,
  GitRepositoryHandle,
  GitRepositoryLinguist,
  GitTreeEntry,
  GitTreeSnapshot,
  MaybePromise,
  ReadDirectoryOptions,
  ReadFileOptions,
  ReadTreeOptions,
} from "#1mbdfxwwqqpa";
import { readRepositoryBlob, readRepositoryLinguist, readRepositoryTreeEntries } from "#632ac808a058";
import { resolveTreeEntryIcon } from "#2ebf9ed6336f";
import { formatTreeAscii, nestTreeEntries, normalizeDirectoryEntry } from "./tree.js";
import {
  countTextLines,
  createEmptyLinguistSnapshot,
  createInspectionProgressReporter,
  getParentPath,
  inspectionSnapshotRef,
  normalizeInspectionPath,
  normalizeInspectionRef,
} from "./shared.js";
import { resolveRepositoryInspectionTarget } from "./target.js";

async function readLineCountForEntry(repository: GitRepositoryHandle, ref: string, entry: GitDirectoryEntry): Promise<number | undefined> {
  if (entry.kind !== "file") return undefined;

  const blob = await readRepositoryBlob(repository, {
    path: entry.path,
    ref,
  });

  if (blob.is_binary || blob.encoding !== "utf8") return undefined;
  return countTextLines(blob.content);
}

async function readEntriesForTarget(
  repository: GitRepositoryHandle,
  target: GitInspectionTargetResolved,
  options: {
    icons?: boolean;
    linguist?: boolean;
    onLinguistProgress?: (event: GitLinguistProgressEvent) => MaybePromise<void>;
    path?: string;
    progress: ReturnType<typeof createInspectionProgressReporter>;
    recursive?: boolean;
  },
): Promise<{ entries: GitTreeEntry[]; linguist: GitRepositoryLinguist | null }> {
  const path = normalizeInspectionPath(options.path);
  await options.progress.emit("reading_tree", {
    commit: target.commit,
    message: path ? `Reading repository tree at "${path}".` : "Reading repository tree.",
    percent: 20,
    resolved_ref: target.resolved_ref,
    source: "tree",
  });

  const rawEntries = await readRepositoryTreeEntries(repository, {
    path,
    recursive: options.recursive === true,
    ref: target.resolved_ref,
  });

  if (path && rawEntries.length === 0) {
    throw new GitHostError("path_not_found", `Path "${path}" does not exist.`, {
      path,
      ref: target.resolved_ref,
      repositoryId: repository.id,
    });
  }

  let linguist: GitRepositoryLinguist | null = null;
  if (options.linguist === true) {
    linguist = await readRepositoryLinguist(repository, {
      async onProgress(event) {
        if (typeof options.onLinguistProgress === "function") {
          await options.onLinguistProgress(event);
        }
        await options.progress.emitLinguist(event);
      },
      ref: target.resolved_ref,
    });
  }

  const entries = rawEntries.map((entry) => ({
    ...entry,
    ...(options.icons === true ? { icon: resolveTreeEntryIcon(entry) } : {}),
    ...(options.linguist === true
      ? {
        language: linguist && Object.prototype.hasOwnProperty.call(linguist.files.results, entry.path)
          ? linguist.files.results[entry.path]
          : null,
      }
      : {}),
  }));

  return { entries, linguist };
}

async function readRepositoryTree(
  repository: GitRepositoryHandle,
  options: ReadTreeOptions = {},
): Promise<GitTreeSnapshot> {
  const requestedRef = normalizeInspectionRef(options.ref);
  const progress = createInspectionProgressReporter(repository, requestedRef, options.onProgress);

  await progress.emit("resolving_ref", {
    message: "Resolving repository ref.",
    percent: 5,
    source: "tree",
  });

  const target = await resolveRepositoryInspectionTarget(repository, options);
  const path = normalizeInspectionPath(options.path);

  if (target.state === "empty") {
    const emptyLinguist = options.linguist === true ? createEmptyLinguistSnapshot(inspectionSnapshotRef(target)) : null;
    const snapshot: GitTreeSnapshot = {
      ...(options.ascii === true ? { ascii: "" } : {}),
      empty: true,
      entries: [],
      ...(options.linguist === true ? { linguist: emptyLinguist } : {}),
      ...(options.nested === true ? { nested: [] } : {}),
      path,
      target,
    };

    await progress.emit("completed", {
      message: "Resolved empty repository snapshot.",
      percent: 100,
      resolved_ref: target.resolved_ref,
      source: "tree",
    });
    return snapshot;
  }

  const { entries, linguist } = await readEntriesForTarget(repository, target, {
    icons: options.icons,
    linguist: options.linguist,
    onLinguistProgress: options.onLinguistProgress,
    path,
    progress,
    recursive: options.recursive,
  });

  await progress.emit("enriching", {
    commit: target.commit,
    message: "Building tree snapshot.",
    percent: 90,
    resolved_ref: target.resolved_ref,
    source: "tree",
  });

  const nested = options.nested === true ? nestTreeEntries(entries) : undefined;
  const ascii = options.ascii === true ? formatTreeAscii(nested || nestTreeEntries(entries)) : undefined;
  const snapshot: GitTreeSnapshot = {
    ...(ascii !== undefined ? { ascii } : {}),
    empty: false,
    entries,
    ...(options.linguist === true ? { linguist } : {}),
    ...(nested !== undefined ? { nested } : {}),
    path,
    target,
  };

  await progress.emit("completed", {
    commit: target.commit,
    message: "Completed tree snapshot.",
    percent: 100,
    resolved_ref: target.resolved_ref,
    source: "tree",
  });

  return snapshot;
}

async function readRepositoryDirectory(
  repository: GitRepositoryHandle,
  options: ReadDirectoryOptions = {},
): Promise<GitDirectorySnapshot> {
  const path = normalizeInspectionPath(options.path);
  const tree = await readRepositoryTree(repository, {
    icons: options.icons,
    linguist: options.linguist,
    onLinguistProgress: options.onLinguistProgress,
    onProgress: options.onProgress,
    path,
    recursive: false,
    ref: options.ref,
    ifMissingRef: options.ifMissingRef,
    ifUnborn: options.ifUnborn,
  });

  if (tree.empty) {
    return {
      empty: true,
      entries: [],
      kind: "dir",
      parent_path: getParentPath(path),
      path,
      target: tree.target,
    };
  }

  const fileEntry = path
    ? tree.entries.find((entry) => entry.path === path && entry.type === "blob") || null
    : null;

  if (fileEntry) {
    const normalized = normalizeDirectoryEntry(fileEntry);
    if (options.includeLineCounts === true) {
      normalized.line_count = await readLineCountForEntry(repository, inspectionSnapshotRef(tree.target), normalized);
    }

    return {
      empty: false,
      entry: normalized,
      kind: "file",
      parent_path: getParentPath(path),
      path,
      target: tree.target,
    };
  }

  const entries = tree.entries.map(normalizeDirectoryEntry);
  if (options.includeLineCounts === true) {
    await Promise.all(entries.map(async (entry) => {
      entry.line_count = await readLineCountForEntry(repository, inspectionSnapshotRef(tree.target), entry);
    }));
  }

  return {
    empty: false,
    entries,
    kind: "dir",
    parent_path: getParentPath(path),
    path,
    target: tree.target,
  };
}

async function readRepositoryFile(
  repository: GitRepositoryHandle,
  options: ReadFileOptions,
): Promise<GitFileSnapshot> {
  const filePath = normalizeInspectionPath(options && options.path);
  if (!filePath) {
    throw new TypeError("readFile() requires a repository-relative path.");
  }

  const requestedRef = normalizeInspectionRef(options.ref);
  const progress = createInspectionProgressReporter(repository, requestedRef, options.onProgress);

  await progress.emit("resolving_ref", {
    message: "Resolving repository ref.",
    percent: 5,
    source: "blob",
  });

  const target = await resolveRepositoryInspectionTarget(repository, options);
  if (target.state === "empty") {
    await progress.emit("completed", {
      message: "Resolved empty repository file snapshot.",
      percent: 100,
      resolved_ref: target.resolved_ref,
      source: "blob",
    });

    return {
      blob: null,
      empty: true,
      ...(options.includeIcon === true ? { icon: null } : {}),
      ...(options.includeLanguage === true ? { language: null } : {}),
      line_count: null,
      parent_path: getParentPath(filePath),
      path: filePath,
      target,
      text: null,
    };
  }

  await progress.emit("reading_blob", {
    commit: target.commit,
    message: `Reading repository file "${filePath}".`,
    percent: 35,
    resolved_ref: target.resolved_ref,
    source: "blob",
  });

  const blob = await readRepositoryBlob(repository, {
    path: filePath,
    ref: target.resolved_ref,
  });

  let treeEntry: GitTreeEntry | null = null;
  if (options.includeIcon === true || options.includeLanguage === true) {
    const treeEntries = await readEntriesForTarget(repository, target, {
      icons: options.includeIcon,
      linguist: options.includeLanguage,
      path: filePath,
      progress,
      recursive: false,
    });
    treeEntry = treeEntries.entries.find((entry) => entry.path === filePath) || null;
  }

  await progress.emit("enriching", {
    commit: target.commit,
    message: "Building file snapshot.",
    percent: 90,
    resolved_ref: target.resolved_ref,
    source: "blob",
  });

  const textContent = blob.is_binary
    ? null
    : (blob.encoding === "utf8"
      ? blob.content
      : Buffer.from(blob.content, "base64").toString("utf8"));

  const snapshot: GitFileSnapshot = {
    blob,
    empty: false,
    ...(options.includeIcon === true ? { icon: treeEntry ? (treeEntry.icon ?? null) : null } : {}),
    ...(options.includeLanguage === true ? { language: treeEntry ? (treeEntry.language ?? null) : null } : {}),
    line_count: textContent == null ? null : countTextLines(textContent),
    parent_path: getParentPath(filePath),
    path: filePath,
    target,
    text: textContent,
  };

  await progress.emit("completed", {
    commit: target.commit,
    message: "Completed file snapshot.",
    percent: 100,
    resolved_ref: target.resolved_ref,
    source: "blob",
  });

  return snapshot;
}
export { readRepositoryDirectory, readRepositoryFile, readRepositoryTree };
