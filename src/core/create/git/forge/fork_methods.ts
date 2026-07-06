import fs from "node:fs";
import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type { CreateGitForgeForkInput, GitForge, SyncGitForgeForkInput } from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import { fetchRepository } from "#1a2e563ea829";
import { buildGitEnv, cloneRepository, ensureHostedRepositoryConfig, runGit } from "#96b00569f1f4";
import { assertActor, ensureUpstreamRemote, nowIso, readForkStatus, repositoryHandleFromSummary } from "./shared.js";
import type { GitForgeRuntimeContext } from "./context.js";

function createListForksMethod(context: GitForgeRuntimeContext) {
  return async (repositoryId: string) => {
    const upstreamSummary = await context.readOverview(repositoryId);
    const upstreamRepository = repositoryHandleFromSummary(upstreamSummary.repository);
    const upstreamBranch = text(upstreamSummary.repository.repository.default_branch, "main");
    const forks = await context.options.storage.forks.listForks(repositoryId);
    return await Promise.all(forks.map(async (fork) => {
      const forkSummary = await context.readOverview(fork.fork_repository_id);
      const forkRepository = repositoryHandleFromSummary(forkSummary.repository);
      return {
        created_at: fork.created_at,
        created_by: fork.created_by,
        fork_repository_id: fork.fork_repository_id,
        fork_status: await readForkStatus(forkRepository, upstreamRepository, upstreamBranch),
        upstream_repository_id: fork.upstream_repository_id,
      };
    }));
  };
}

function createCreateForkMethod(context: GitForgeRuntimeContext) {
  return async (repositoryId: string, input: CreateGitForgeForkInput) => {
    const actor = assertActor(input.actor);
    const upstreamSummary = await context.readOverview(repositoryId);
    const upstreamRepository = repositoryHandleFromSummary(upstreamSummary.repository);
    const upstreamBranch = text(upstreamSummary.repository.repository.default_branch, "main");
    const forkRepository = await context.options.createForkRepository({ actor, upstreamRepository, upstreamRepositoryId: repositoryId });
    if (!forkRepository || !text(forkRepository.id) || !text(forkRepository.path)) {
      throw new GitHostError("forge_invalid_input", "createForkRepository() must return a repository id and absolute path.", { repositoryId });
    }
    await cloneForkRepository(repositoryId, forkRepository, upstreamRepository.path);
    await ensureUpstreamRemote(forkRepository, upstreamRepository.path);
    await fetchRepository(forkRepository, { remote: "upstream" });
    const createdAt = nowIso();
    await context.options.storage.forks.createFork({
      created_at: createdAt,
      created_by: actor.id,
      fork_repository_id: forkRepository.id,
      upstream_repository_id: repositoryId,
    });
    await context.recordActivity(repositoryId, actor, "fork.create", { fork_repository_id: forkRepository.id });
    if (context.verbose) context.logger.info(context.logGroup, "created forge fork", { forkRepositoryId: forkRepository.id, repositoryId });
    return {
      created_at: createdAt,
      created_by: actor.id,
      fork_repository_id: forkRepository.id,
      fork_status: await readForkStatus(forkRepository, upstreamRepository, upstreamBranch),
      upstream_repository_id: repositoryId,
    };
  };
}

function createSyncForkMethod(context: GitForgeRuntimeContext) {
  return async (forkRepositoryId: string, input: SyncGitForgeForkInput) => {
    const actor = assertActor(input.actor);
    const fork = await context.readRequiredFork(forkRepositoryId);
    const upstreamSummary = await context.readOverview(fork.upstream_repository_id);
    const forkSummary = await context.readOverview(fork.fork_repository_id);
    const upstreamRepository = repositoryHandleFromSummary(upstreamSummary.repository);
    const forkRepository = repositoryHandleFromSummary(forkSummary.repository);
    const upstreamBranch = text(upstreamSummary.repository.repository.default_branch, "main");
    const forkBranch = text(forkSummary.repository.repository.current_branch || forkSummary.repository.repository.default_branch, "main");
    const strategy = input.strategy || "ff-only";
    await ensureUpstreamRemote(forkRepository, upstreamRepository.path);
    await fetchRepository(forkRepository, { remote: "upstream" });
    if (forkBranch !== forkSummary.repository.repository.current_branch) {
      await context.options.gitHost.checkoutBranch(forkRepository.id, { name: forkBranch });
    }
    await applyForkSyncStrategy(forkRepositoryId, forkRepository.path, actor, strategy, forkBranch, upstreamBranch);
    await context.recordActivity(fork.upstream_repository_id, actor, "fork.sync", { fork_repository_id: forkRepositoryId, strategy });
    return {
      created_at: fork.created_at,
      created_by: fork.created_by,
      fork_repository_id: fork.fork_repository_id,
      fork_status: await readForkStatus(forkRepository, upstreamRepository, upstreamBranch),
      upstream_repository_id: fork.upstream_repository_id,
    };
  };
}

function createForkMethods(context: GitForgeRuntimeContext): Pick<GitForge, "createFork" | "listForks" | "syncFork"> {
  return {
    createFork: createCreateForkMethod(context),
    listForks: createListForksMethod(context),
    syncFork: createSyncForkMethod(context),
  };
}

async function cloneForkRepository(repositoryId: string, forkRepository: { id: string; path: string }, upstreamPath: string) {
  fs.mkdirSync(path.dirname(forkRepository.path), { recursive: true });
  const cloneRes = await cloneRepository({ cloneUrl: upstreamPath, workspaceRoot: forkRepository.path });
  if (!cloneRes.ok) {
    throw new GitHostError("git_command_failed", text(cloneRes.stderr, "Failed to clone the fork repository."), {
      forkRepositoryId: forkRepository.id,
      repositoryId,
    });
  }
  const hostedRes = await ensureHostedRepositoryConfig(forkRepository.path);
  if (!hostedRes.ok) {
    throw new GitHostError("git_command_failed", text(hostedRes.stderr, "Failed to configure the fork repository."), {
      forkRepositoryId: forkRepository.id,
      repositoryId,
    });
  }
}

async function applyForkSyncStrategy(
  forkRepositoryId: string,
  repositoryPath: string,
  actor: ReturnType<typeof assertActor>,
  strategy: string,
  forkBranch: string,
  upstreamBranch: string,
) {
  const upstreamRef = `upstream/${upstreamBranch}`;
  if (strategy === "ff-only") return await fastForwardFork(forkRepositoryId, repositoryPath, actor, forkBranch, upstreamRef, upstreamBranch);
  return await mergeForkUpstream(forkRepositoryId, repositoryPath, actor, upstreamRef, upstreamBranch);
}

async function fastForwardFork(
  forkRepositoryId: string,
  repositoryPath: string,
  actor: ReturnType<typeof assertActor>,
  forkBranch: string,
  upstreamRef: string,
  upstreamBranch: string,
) {
  const ffCheck = await runGit(["merge-base", "--is-ancestor", forkBranch, upstreamRef], { cwd: repositoryPath });
  if (!ffCheck.ok) {
    throw new GitHostError("forge_sync_conflict", "The fork cannot be fast-forwarded from upstream.", { forkRepositoryId, upstreamBranch });
  }
  const mergeRes = await runGit(["merge", "--ff-only", upstreamRef], { cwd: repositoryPath, env: buildGitEnv({ actor }) });
  if (!mergeRes.ok) {
    throw new GitHostError("forge_sync_conflict", text(mergeRes.stderr, "The fork cannot be fast-forwarded from upstream."), { forkRepositoryId, upstreamBranch });
  }
}

async function mergeForkUpstream(
  forkRepositoryId: string,
  repositoryPath: string,
  actor: ReturnType<typeof assertActor>,
  upstreamRef: string,
  upstreamBranch: string,
) {
  const mergeRes = await runGit(["merge", "--no-edit", upstreamRef], { cwd: repositoryPath, env: buildGitEnv({ actor }) });
  if (!mergeRes.ok) {
    throw new GitHostError("forge_sync_conflict", text(mergeRes.stderr, "Failed to merge upstream changes into the fork."), { forkRepositoryId, upstreamBranch });
  }
}

export { createForkMethods };
