import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  GitInspectionRef,
  GitInspectionTarget,
  GitInspectionTargetEmpty,
  GitInspectionTargetResolved,
  GitRepositoryHandle,
  ResolveInspectionTargetOptions,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { assertRepositoryReady } from "#61bf255baf35";
import { runGit } from "#96b00569f1f4";
import {
  inspectionSnapshotRef,
  isExplicitInspectionRef,
  normalizeInspectionRef,
  resolveEmptyBehavior,
} from "./shared.js";

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

export { resolveRepositoryInspectionTarget };
