import type { GitHost, ListCommitsOptions } from "#14021226ec9b";
import { assertRepositoryReady } from "#96b00569f1f4";
import {
  readRepositoryBranches,
  readRepositoryCommits,
  readRepositoryTag,
  readRepositoryTags,
} from "#1fu49obi0gq3";
import type { GitHostMethodContext } from "#92b2mrh7s066";
import { toGitHostError } from "#92b2mrh7s066";

function createBranchReadMethods(
  context: GitHostMethodContext,
): Pick<GitHost, "listBranches"|"listCommits"|"listTags"|"readTag"> {
  const { resolveRepository } = context;

  return {
    async listBranches(repositoryId: string) {
      const repository = await resolveRepository(repositoryId);
      await assertRepositoryReady(repository);
      try {
        return await readRepositoryBranches(repository.path);
      } catch (error) {
        throw toGitHostError(
          error,
          "git_command_failed",
          "Failed to list repository branches.",
        );
      }
    },
    async listCommits(
      repositoryId: string,
      listOptions: ListCommitsOptions = {},
    ) {
      const repository = await resolveRepository(repositoryId);
      await assertRepositoryReady(repository);
      try {
        return await readRepositoryCommits(repository.path, listOptions);
      } catch (error) {
        throw toGitHostError(
          error,
          "git_command_failed",
          "Failed to list repository commits.",
        );
      }
    },
    async listTags(repositoryId: string) {
      const repository = await resolveRepository(repositoryId);
      await assertRepositoryReady(repository);
      try {
        return await readRepositoryTags(repository.path);
      } catch (error) {
        throw toGitHostError(
          error,
          "git_command_failed",
          "Failed to list repository tags.",
        );
      }
    },
    async readTag(repositoryId: string, tagName: string) {
      const repository = await resolveRepository(repositoryId);
      await assertRepositoryReady(repository);
      try {
        return await readRepositoryTag(repository.path, tagName);
      } catch (error) {
        throw toGitHostError(
          error,
          "git_command_failed",
          "Failed to read repository tag.",
        );
      }
    },
  };
}

export { createBranchReadMethods };
