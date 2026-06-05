import { GitHostError } from "../errors.js";
import type {
  GitDirectoryEntry,
  GitDirectorySnapshot,
  GitFileSnapshot,
  GitInspectionEmptyBehavior,
  GitInspectionProgressEvent,
  GitInspectionProgressPhase,
  GitInspectionRef,
  GitInspectionTarget,
  GitInspectionTargetEmpty,
  GitInspectionTargetResolved,
  GitLinguistProgressEvent,
  GitRepositoryAnalysis,
  GitRepositoryHandle,
  GitRepositoryLinguist,
  GitTreeEntry,
  GitTreeNode,
  GitTreeSnapshot,
  MaybePromise,
  ReadDirectoryOptions,
  ReadFileOptions,
  ReadRepositoryAnalysisOptions,
  ReadTreeOptions,
  ResolveInspectionTargetOptions,
} from "../types.js";
import { normalizeRepositoryRelativePath } from "../utils/paths.js";
import { text } from "../utils/text.js";
import { readRepositoryBlob, readRepositoryLinguist, readRepositoryTreeEntries } from "./inspect.js";
import { resolveTreeEntryIcon } from "./inspect/icon_theme.js";
import { assertRepositoryReady } from "./inspect/helpers.js";
import { runGit } from "./run_git.js";

type InspectionProgressCallback = (event: GitInspectionProgressEvent) => MaybePromise<void>;

type InspectionProgressReporter = {
  emit: (
    phase: GitInspectionProgressPhase,
    update?: Partial<Omit<GitInspectionProgressEvent, "emitted_at" | "phase" | "repository_id" | "requested_ref">>,
  ) => Promise<void>;
  emitLinguist: (event: GitLinguistProgressEvent) => Promise<void>;
};

function normalizeInspectionPath(value: unknown): string {
  const raw = text(value);
  return raw ? normalizeRepositoryRelativePath(raw) : "";
}

function normalizeInspectionRef(value: unknown): GitInspectionRef {
  const raw = text(value);
  return raw || "auto";
}

function isExplicitInspectionRef(ref: GitInspectionRef): boolean {
  return text(ref) !== "auto";
}

function resolveEmptyBehavior(value: unknown, explicitRef: boolean): GitInspectionEmptyBehavior {
  const normalized = text(value);
  if (normalized === "error" || normalized === "empty") return normalized;
  return explicitRef ? "error" : "empty";
}

function inspectionSnapshotRef(target: GitInspectionTarget): string {
  if (target.state === "resolved") return target.resolved_ref;
  return target.resolved_ref || (target.requested_ref === "auto" ? "HEAD" : target.requested_ref);
}

function createEmptyLinguistSnapshot(ref: string): GitRepositoryLinguist {
  return {
    commit: "",
    files: {
      bytes: 0,
      count: 0,
      lines: {
        content: 0,
        total: 0,
      },
      results: {},
    },
    languages: {
      bytes: 0,
      count: 0,
      lines: {
        content: 0,
        total: 0,
      },
      results: {},
    },
    ref,
    unknown: {
      bytes: 0,
      count: 0,
      extensions: {},
      filenames: {},
      lines: {
        content: 0,
        total: 0,
      },
    },
  };
}

function countTextLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function getParentPath(pathInput: string): string | null {
  const normalized = normalizeInspectionPath(pathInput);
  if (!normalized) return null;
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : "";
}

function toTreeNodeKind(entry: GitTreeEntry): "dir" | "file" {
  return entry.type === "tree" ? "dir" : "file";
}

function normalizeDirectoryEntry(entry: GitTreeEntry): GitDirectoryEntry {
  return {
    icon: entry.icon ?? null,
    kind: toTreeNodeKind(entry),
    language: entry.language ?? null,
    mode: entry.mode,
    name: entry.name,
    object: entry.object,
    path: entry.path,
    size: entry.size,
  };
}

function normalizeTreeNode(entry: GitTreeEntry): GitTreeNode {
  return {
    icon: entry.icon ?? null,
    kind: toTreeNodeKind(entry),
    language: entry.language ?? null,
    mode: entry.mode,
    name: entry.name,
    object: entry.object,
    path: entry.path,
    size: entry.size,
  };
}

type InternalTreeNode = Omit<GitTreeNode, "children"> & {
  child_map?: Map<string, InternalTreeNode>;
};

function nestTreeEntries(entries: GitTreeEntry[]): GitTreeNode[] {
  const root = {
    child_map: new Map<string, InternalTreeNode>(),
  };

  function ensureDirectory(parts: string[]): InternalTreeNode {
    let cursor: { child_map: Map<string, InternalTreeNode> } = root;
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!cursor.child_map.has(part)) {
        cursor.child_map.set(part, {
          child_map: new Map(),
          kind: "dir",
          icon: null,
          language: null,
          mode: "040000",
          name: part,
          object: "",
          path: currentPath,
          size: null,
        });
      }

      cursor = cursor.child_map.get(part) as InternalTreeNode & { child_map: Map<string, InternalTreeNode> };
    }

    return cursor as InternalTreeNode;
  }

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    if (!parts.length) continue;

    const parent = ensureDirectory(parts.slice(0, -1));
    const node = normalizeTreeNode(entry);

    if (node.kind === "dir") {
      const dirNode = ensureDirectory(parts);
      dirNode.icon = node.icon ?? dirNode.icon ?? null;
      dirNode.language = node.language ?? dirNode.language ?? null;
      dirNode.mode = node.mode || dirNode.mode;
      dirNode.object = node.object || dirNode.object;
      continue;
    }

    (parent.child_map as Map<string, InternalTreeNode>).set(node.name, node);
  }

  function toPublicNode(node: InternalTreeNode): GitTreeNode {
    const {
      child_map: childMap,
      ...base
    } = node;

    if (node.kind !== "dir") return base;
    return {
      ...base,
      children: childMap ? toArray({ child_map: childMap }) : [],
    };
  }

  function toArray(node: { child_map: Map<string, InternalTreeNode> }): GitTreeNode[] {
    const values = Array.from(node.child_map.values());
    values.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "dir" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });

    return values.map(toPublicNode);
  }

  return toArray(root);
}

function formatTreeAscii(nodes: GitTreeNode[], prefix = ""): string {
  const lines: string[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const isLast = index === nodes.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const nextPrefix = prefix + (isLast ? "    " : "│   ");

    lines.push(`${prefix}${branch}${node.name}`);
    if (node.kind === "dir" && Array.isArray(node.children) && node.children.length) {
      lines.push(formatTreeAscii(node.children, nextPrefix));
    }
  }

  return lines.filter(Boolean).join("\n");
}

function createInspectionProgressReporter(
  repository: GitRepositoryHandle,
  requestedRef: GitInspectionRef,
  onProgress?: InspectionProgressCallback,
): InspectionProgressReporter {
  const callback = typeof onProgress === "function" ? onProgress : null;

  return {
    async emit(phase, update = {}) {
      if (!callback) return;

      await callback({
        commit: typeof update.commit === "string" ? update.commit : undefined,
        emitted_at: new Date().toISOString(),
        error: update.error,
        message: text(update.message, phase),
        percent: Number.isFinite(Number(update.percent)) ? Math.max(0, Math.min(100, Number(update.percent) || 0)) : 0,
        phase,
        raw_linguist: update.raw_linguist,
        repository_id: repository.id,
        requested_ref: requestedRef,
        resolved_ref: update.resolved_ref === undefined ? undefined : update.resolved_ref,
        source: update.source,
      });
    },

    async emitLinguist(event) {
      if (!callback) return;

      await callback({
        commit: event.commit,
        emitted_at: new Date().toISOString(),
        error: event.error,
        message: text(event.message, "Running repository linguist analysis."),
        percent: Number.isFinite(Number(event.percent)) ? Math.max(0, Math.min(100, Number(event.percent) || 0)) : 0,
        phase: "running_linguist",
        raw_linguist: event,
        repository_id: repository.id,
        requested_ref: requestedRef,
        resolved_ref: text(event.ref) || undefined,
        source: "linguist",
      });
    },
  };
}

async function tryResolveCommitForRef(repository: GitRepositoryHandle, ref: string): Promise<{ commit: string; ref: string } | null> {
  const revision = text(ref);
  if (!revision) return null;

  const revisionRes = await runGit(["rev-parse", "--verify", `${revision}^{commit}`], { cwd: repository.path });
  if (!revisionRes.ok) return null;

  return {
    commit: text(revisionRes.stdout),
    ref: revision,
  };
}

async function hasRepositoryHeadCommit(repository: GitRepositoryHandle): Promise<boolean> {
  const revisionRes = await runGit(["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repository.path });
  return revisionRes.ok;
}

async function readCurrentBranchRef(repository: GitRepositoryHandle): Promise<string | null> {
  const branchRes = await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: repository.path });
  if (!branchRes.ok) return null;
  const branch = text(branchRes.stdout);
  return branch || null;
}

function buildResolvedInspectionTarget(
  requestedRef: GitInspectionRef,
  resolvedRef: string,
  commit: string,
  explicitRef: boolean,
): GitInspectionTargetResolved {
  return {
    commit,
    explicit_ref: explicitRef,
    requested_ref: requestedRef,
    resolved_ref: resolvedRef,
    state: "resolved",
  };
}

function buildEmptyInspectionTarget(
  requestedRef: GitInspectionRef,
  resolvedRef: string | null,
  reason: "missing_ref" | "unborn",
  explicitRef: boolean,
): GitInspectionTargetEmpty {
  return {
    explicit_ref: explicitRef,
    reason,
    requested_ref: requestedRef,
    resolved_ref: resolvedRef,
    state: "empty",
  };
}

function throwInspectionTargetError(
  repository: GitRepositoryHandle,
  target: GitInspectionTargetEmpty,
): never {
  if (target.reason === "unborn") {
    throw new GitHostError("repository_unborn", `Repository "${repository.id}" has no commits yet.`, {
      reason: target.reason,
      ref: target.resolved_ref || null,
      repositoryId: repository.id,
    });
  }

  throw new GitHostError("ref_not_found", `Repository ref "${inspectionSnapshotRef(target)}" does not exist.`, {
    reason: target.reason,
    ref: inspectionSnapshotRef(target),
    repositoryId: repository.id,
  });
}

async function resolveRepositoryInspectionTarget(
  repository: GitRepositoryHandle,
  options: ResolveInspectionTargetOptions = {},
): Promise<GitInspectionTarget> {
  await assertRepositoryReady(repository);

  const requestedRef = normalizeInspectionRef(options.ref);
  const explicitRef = isExplicitInspectionRef(requestedRef);
  const ifUnborn = resolveEmptyBehavior(options.ifUnborn, explicitRef);
  const ifMissingRef = resolveEmptyBehavior(options.ifMissingRef, explicitRef);

  if (explicitRef) {
    const resolved = await tryResolveCommitForRef(repository, text(requestedRef));
    if (resolved) {
      return buildResolvedInspectionTarget(requestedRef, resolved.ref, resolved.commit, true);
    }

    const hasHead = await hasRepositoryHeadCommit(repository);
    const emptyTarget = buildEmptyInspectionTarget(
      requestedRef,
      text(requestedRef),
      hasHead ? "missing_ref" : "unborn",
      true,
    );

    if (emptyTarget.reason === "unborn" && ifUnborn === "empty") return emptyTarget;
    if (emptyTarget.reason === "missing_ref" && ifMissingRef === "empty") return emptyTarget;
    throwInspectionTargetError(repository, emptyTarget);
  }

  const currentBranch = await readCurrentBranchRef(repository);
  if (currentBranch) {
    const branchTarget = await tryResolveCommitForRef(repository, currentBranch);
    if (branchTarget) {
      return buildResolvedInspectionTarget("auto", branchTarget.ref, branchTarget.commit, false);
    }
  }

  const headTarget = await tryResolveCommitForRef(repository, "HEAD");
  if (headTarget) {
    return buildResolvedInspectionTarget("auto", headTarget.ref, headTarget.commit, false);
  }

  const emptyTarget = buildEmptyInspectionTarget("auto", currentBranch, "unborn", false);
  if (ifUnborn === "empty") return emptyTarget;
  throwInspectionTargetError(repository, emptyTarget);
}

async function readLineCountForEntry(
  repository: GitRepositoryHandle,
  ref: string,
  entry: GitDirectoryEntry,
): Promise<number | undefined> {
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
    progress: InspectionProgressReporter;
    path?: string;
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

async function readRepositoryAnalysis(
  repository: GitRepositoryHandle,
  options: ReadRepositoryAnalysisOptions = {},
): Promise<GitRepositoryAnalysis> {
  const tree = await readRepositoryTree(repository, {
    ascii: options.ascii,
    icons: options.icons,
    ifMissingRef: options.ifMissingRef,
    ifUnborn: options.ifUnborn,
    linguist: true,
    nested: options.nested,
    onLinguistProgress: options.onLinguistProgress,
    onProgress: options.onProgress,
    path: options.path,
    recursive: options.recursive !== false,
    ref: options.ref,
  });

  return {
    empty: tree.empty,
    linguist: tree.linguist || createEmptyLinguistSnapshot(inspectionSnapshotRef(tree.target)),
    target: tree.target,
    tree,
  };
}

export {
  createEmptyLinguistSnapshot,
  formatTreeAscii,
  nestTreeEntries,
  readRepositoryAnalysis,
  readRepositoryDirectory,
  readRepositoryFile,
  readRepositoryTree,
  resolveRepositoryInspectionTarget,
};
