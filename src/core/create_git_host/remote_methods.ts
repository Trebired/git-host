import type { FetchOptions, GitHost, PullOptions, PushOptions } from "../../types.js";
import { text } from "../../utils/text.js";
import { fetchRepository, pullRepository, pushRepository } from "../remote.js";
import type { GitHostMethodContext } from "./shared.js";

function createRemoteMethods(context: GitHostMethodContext): Pick<GitHost, "fetch" | "pull" | "push"> {
  const { ensureRepositoryInner, lockManager, logGroup, logger, readSummaryForRepository, verbose } = context;

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
        return await readSummaryForRepository(repository);
      });
    },
  };
}

export { createRemoteMethods };
