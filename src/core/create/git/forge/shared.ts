import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeActor,
  GitForgeForkStatus,
  GitForgeRepositoryOverview,
  GitRepositoryHandle,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import { fetchRepository } from "#1a2e563ea829";
import { repositoryExists, runGit } from "#96b00569f1f4";

function repositoryHandleFromSummary(summary: GitForgeRepositoryOverview["repository"]): GitRepositoryHandle {
  return {
    id: summary.repository.id,
    path: summary.repository.path,
  };
}

function assertActor(actor: GitForgeActor | undefined | null): GitForgeActor {
  if (!actor || !text(actor.id)) {
    throw new GitHostError("forge_invalid_actor", "A stable actor id is required for forge mutations.");
  }
  return {
    ...actor,
    id: text(actor.id),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function countDistinct(values: string[] | undefined | null): Promise<number> {
  return new Set((values || []).map((value) => text(value)).filter(Boolean)).size;
}

async function ensureUpstreamRemote(repository: GitRepositoryHandle, upstreamPath: string): Promise<void> {
  const listRes = await runGit(["remote"], { cwd: repository.path });
  if (!listRes.ok) {
    throw new GitHostError("git_command_failed", text(listRes.stderr, "Failed to list repository remotes."), {
      repositoryId: repository.id,
    });
  }
  const remotes = new Set(text(listRes.stdout).split(/\r?\n/).map((entry) => text(entry)).filter(Boolean));
  const command = remotes.has("upstream")
    ? ["remote", "set-url", "upstream", upstreamPath]
    : ["remote", "add", "upstream", upstreamPath];
  const remoteRes = await runGit(command, { cwd: repository.path });
  if (!remoteRes.ok) {
    throw new GitHostError("git_command_failed", text(remoteRes.stderr, "Failed to configure the upstream remote."), {
      repositoryId: repository.id,
    });
  }
}

async function readForkStatus(forkRepository: GitRepositoryHandle, upstreamRepository: GitRepositoryHandle, upstreamBranch: string): Promise<GitForgeForkStatus> {
  const hasFork = await repositoryExists(forkRepository.path);
  if (!hasFork) {
    throw new GitHostError("repository_not_initialized", `Repository "${forkRepository.id}" is not initialized.`, {
      path: forkRepository.path,
      repositoryId: forkRepository.id,
    });
  }
  await ensureUpstreamRemote(forkRepository, upstreamRepository.path);
  await fetchRepository(forkRepository, { remote: "upstream" });
  const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: forkRepository.path });
  if (!branchRes.ok) {
    throw new GitHostError("git_command_failed", text(branchRes.stderr, "Failed to resolve the fork branch."), {
      repositoryId: forkRepository.id,
    });
  }
  const forkBranch = text(branchRes.stdout);
  const compareRes = await runGit(["rev-list", "--left-right", "--count", `${forkBranch}...upstream/${upstreamBranch}`], {
    cwd: forkRepository.path,
  });
  if (!compareRes.ok) {
    throw new GitHostError("git_command_failed", text(compareRes.stderr, "Failed to compare fork progress."), {
      forkBranch,
      repositoryId: forkRepository.id,
      upstreamBranch,
    });
  }
  const [aheadText, behindText] = text(compareRes.stdout).split(/\s+/);
  return {
    ahead: Number(aheadText) || 0,
    behind: Number(behindText) || 0,
    fork_branch: forkBranch,
    upstream_branch: upstreamBranch,
  };
}

export { assertActor, countDistinct, ensureUpstreamRemote, nowIso, readForkStatus, repositoryHandleFromSummary };
