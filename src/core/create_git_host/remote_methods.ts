import type { FetchOptions, GitHost, GitRepositoryHandle, PullOptions, PushOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { readRepositoryActivityContext } from "#yotdvtav6ika";
import { fetchRepository, pullRepository, pushRepository } from "#6qp108ftbm6e";
import type { GitHostMethodContext } from "./shared.js";

function compactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value === undefined) return false;
      return typeof value !== "string" || value.trim() !== "";
    }),
  );
}

async function recordRemoteActivity(
  context: GitHostMethodContext,
  repository: GitRepositoryHandle,
  input: {
    actor?: {
      id?: string;
      name?: string;
    };
    kind: "repository.fetch" | "repository.pull" | "repository.push";
    metadata: Record<string, unknown>;
  },
) {
  if (!context.options.activity) return;
  const repositoryContext = await readRepositoryActivityContext(repository);
  await context.options.activity.recordActivity({
    actor_id: text(input.actor?.id),
    actor_label: text(input.actor?.name, input.actor?.id),
    kind: input.kind,
    metadata: {
      ...repositoryContext,
      ...compactMetadata(input.metadata),
    },
    repository_id: repository.id,
    source: "api",
  });
}

function logRemoteOperation(context: GitHostMethodContext, repositoryId: string, action: string, remote: unknown) {
  if (!context.verbose) return;
  context.logger.info(context.logGroup, `${action} repository remote`, {
    remote: text(remote, "origin"),
    repositoryId,
  });
}

function createFetchMethod(context: GitHostMethodContext) {
  return async (repositoryId: string, options: FetchOptions = {}) => await context.lockManager.withLock(text(repositoryId), async () => {
    const repository = await context.ensureRepositoryInner(repositoryId);
    logRemoteOperation(context, repository.id, "fetching", options.remote);
    await fetchRepository(repository, options);
    await recordRemoteActivity(context, repository, {
      kind: "repository.fetch",
      metadata: {
        operation: "fetch",
        prune: options.prune === true,
        remote: text(options.remote, "origin"),
        remote_url: text(options.remoteUrl),
        remote_username: text(options.remoteCredentials?.username),
        tags: options.tags === true,
      },
    });
    return await context.readSummaryForRepository(repository);
  });
}

function createPullMethod(context: GitHostMethodContext) {
  return async (repositoryId: string, options: PullOptions = {}) => await context.lockManager.withLock(text(repositoryId), async () => {
    const repository = await context.ensureRepositoryInner(repositoryId);
    logRemoteOperation(context, repository.id, "pulling", options.remote);
    await pullRepository(repository, options);
    await recordRemoteActivity(context, repository, {
      actor: options.actor,
      kind: "repository.pull",
      metadata: {
        branch: text(options.branch),
        ff_only: options.ffOnly !== false,
        operation: "pull",
        rebase: options.rebase === true,
        remote: text(options.remote, "origin"),
        remote_url: text(options.remoteUrl),
        remote_username: text(options.remoteCredentials?.username),
      },
    });
    return await context.readSummaryForRepository(repository);
  });
}

function createPushMethod(context: GitHostMethodContext) {
  return async (repositoryId: string, options: PushOptions = {}) => await context.lockManager.withLock(text(repositoryId), async () => {
    const repository = await context.ensureRepositoryInner(repositoryId);
    logRemoteOperation(context, repository.id, "pushing", options.remote);
    await pushRepository(repository, options);
    await recordRemoteActivity(context, repository, {
      actor: options.actor,
      kind: "repository.push",
      metadata: {
        branch: text(options.branch),
        operation: "push",
        remote: text(options.remote, "origin"),
        remote_url: text(options.remoteUrl),
        remote_username: text(options.remoteCredentials?.username),
        set_upstream: options.setUpstream === true,
      },
    });
    return await context.readSummaryForRepository(repository);
  });
}

function createRemoteMethods(context: GitHostMethodContext): Pick<GitHost, "fetch" | "pull" | "push"> {
  return {
    fetch: createFetchMethod(context),
    pull: createPullMethod(context),
    push: createPushMethod(context),
  };
}

export { createRemoteMethods };
