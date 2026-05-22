import type {
  CommitInput,
  ContinueOperationInput,
  DiscardPathsInput,
  GitHost,
  ReadWorkingTreeFileOptions,
  StagePathsInput,
  UnstagePathsInput,
} from "../../types.js";
import { text } from "../../utils/text.js";
import {
  abortRepositoryOperation,
  commitRepository,
  continueRepositoryOperation,
  discardRepositoryPaths,
  readRepositoryStagedFile,
  readRepositoryUnstagedFile,
  readRepositoryWorkingTree,
  stageRepositoryPaths,
  unstageRepositoryPaths,
} from "../working_tree.js";
import type { GitHostMethodContext } from "./shared.js";

function createWorkingTreeMethods(context: GitHostMethodContext): Pick<
  GitHost,
  | "abortOperation"
  | "commit"
  | "continueOperation"
  | "discardPaths"
  | "readStagedFile"
  | "readUnstagedFile"
  | "readWorkingTree"
  | "stagePaths"
  | "unstagePaths"
> {
  const { ensureRepositoryInner, lockManager, readSummaryForRepository, resolveRepository } = context;

  return {
    async readWorkingTree(repositoryId: string) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryWorkingTree(repository);
    },

    async readStagedFile(repositoryId: string, options: ReadWorkingTreeFileOptions) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryStagedFile(repository, options);
    },

    async readUnstagedFile(repositoryId: string, options: ReadWorkingTreeFileOptions) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryUnstagedFile(repository, options);
    },

    async stagePaths(repositoryId: string, input: StagePathsInput = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        await stageRepositoryPaths(repository, input);
        return await readSummaryForRepository(repository);
      });
    },

    async unstagePaths(repositoryId: string, input: UnstagePathsInput = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        await unstageRepositoryPaths(repository, input);
        return await readSummaryForRepository(repository);
      });
    },

    async discardPaths(repositoryId: string, input: DiscardPathsInput = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        await discardRepositoryPaths(repository, input);
        return await readSummaryForRepository(repository);
      });
    },

    async commit(repositoryId: string, input: CommitInput) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        await commitRepository(repository, input);
        return await readSummaryForRepository(repository);
      });
    },

    async continueOperation(repositoryId: string, input: ContinueOperationInput = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        await continueRepositoryOperation(repository, input);
        return await readSummaryForRepository(repository);
      });
    },

    async abortOperation(repositoryId: string) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        await abortRepositoryOperation(repository);
        return await readSummaryForRepository(repository);
      });
    },
  };
}

export { createWorkingTreeMethods };
