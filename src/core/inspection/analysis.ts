import type { GitRepositoryAnalysis, GitRepositoryHandle, ReadRepositoryAnalysisOptions } from "#1mbdfxwwqqpa";
import { createEmptyLinguistSnapshot, inspectionSnapshotRef } from "./shared.js";
import { readRepositoryTree } from "./snapshots.js";

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

export { readRepositoryAnalysis };
