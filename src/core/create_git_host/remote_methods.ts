import type { FetchOptions, GitHost, GitRepositoryHandle, PullOptions, PushOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { readRepositoryActivityContext } from "../activity.js";
import { fetchRepository, pullRepository, pushRepository } from "#6qp108ftbm6e";
import type { GitHostMethodContext } from "./shared.js";

function createRemoteMethods(context: GitHostMethodContext): Pick<GitHost, "fetch" | "pull" | "push"> {
  const { ensureRepositoryInner, lockManager, logGroup, logger, readSummaryForRepository, verbose } = context;

  function compactMetadata(metadata: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => {
        if (value === undefined) return false;
        return typeof value !== "string" || value.trim() !== "";
      }),
    );
  }

  async function recordRemoteActivity(
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

  return {
    async fetch(repositoryId: string, options: FetchOptions = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        if (verbose) {
          logger.info(logGroup, "fetching repository remote", {
            remote: text(options.remote, "origin"),
            repositoryId: repository.id,
          });
        }
        await fetchRepository(repository, options);
        await recordRemoteActivity(repository, {
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
        return await readSummaryForRepository(repository);
      });
    },

    async pull(repositoryId: string, options: PullOptions = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        if (verbose) {
          logger.info(logGroup, "pulling repository remote", {
            remote: text(options.remote, "origin"),
            repositoryId: repository.id,
          });
        }
        await pullRepository(repository, options);
        await recordRemoteActivity(repository, {
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
        return await readSummaryForRepository(repository);
      });
    },

    async push(repositoryId: string, options: PushOptions = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        if (verbose) {
          logger.info(logGroup, "pushing repository remote", {
            remote: text(options.remote, "origin"),
            repositoryId: repository.id,
          });
        }
        await pushRepository(repository, options);
        await recordRemoteActivity(repository, {
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
        return await readSummaryForRepository(repository);
      });
    },
  };
}

export { createRemoteMethods };
