import type {
  CreateGitHostOptions,
  EnsureRepositoryOptions,
  GitHost,
  ReadSummaryOptions,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { createContentMethods } from "#40nx1s0ag764";
import { createRemoteMethods } from "#a9f1d698c0aa";
import { createWorkingTreeMethods } from "#de031fc6c08f";
import { createBranchMethods } from "#csltr4n8471b";
import {
  createGitHostRuntime,
  createMethodContext,
  createReadSummaryInner,
  createResolveRepository,
  validateCreateGitHostOptions,
} from "./host_runtime.js";

function createGitHost(options: CreateGitHostOptions): GitHost {
  validateCreateGitHostOptions(options);
  const runtime = createGitHostRuntime(options);
  const resolveRepository = createResolveRepository(options);
  const { ensureRepositoryInner, methodContext, readSummaryForRepository } =
  createMethodContext(runtime, resolveRepository);
  const readSummaryInner = createReadSummaryInner(
    resolveRepository,
    readSummaryForRepository,
  );
  return {
    async ensureRepository(
      repositoryId: string,
      ensureOptions: EnsureRepositoryOptions = {},
    ) {
      return await runtime.lockManager.withLock(
        text(repositoryId),
        async() =>
        await readSummaryForRepository(
          await ensureRepositoryInner(repositoryId, ensureOptions),
          ensureOptions.commitLimit,
        ),
      );
    },
    async readSummary(
      repositoryId: string,
      summaryOptions: ReadSummaryOptions = {},
    ) {
      return await readSummaryInner(repositoryId, summaryOptions);
    },
    async withRepositoryLock<T>(
      repositoryId: string,
      operation: () => Promise<T>,
    ) {
      return await runtime.lockManager.withLock(text(repositoryId), operation);
    },
    ...createBranchMethods(methodContext),
    ...createWorkingTreeMethods(methodContext),
    ...createRemoteMethods(methodContext),
    ...createContentMethods(methodContext),
  };
}

export { createGitHost };
