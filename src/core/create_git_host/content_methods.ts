import type { DiffOptions, GitHost, ListTreeOptions, ReadBlobOptions } from "../../types.js";
import { listRepositoryTree, readRepositoryBlob, readRepositoryCommit, readRepositoryCompare } from "../inspect.js";
import type { GitHostMethodContext } from "./shared.js";

function createContentMethods(context: GitHostMethodContext): Pick<GitHost, "diff" | "listTree" | "readBlob" | "readCommit"> {
  const { resolveRepository } = context;

  return {
    async listTree(repositoryId: string, treeOptions: ListTreeOptions = {}) {
      const repository = await resolveRepository(repositoryId);
      return await listRepositoryTree(repository, treeOptions);
    },

    async readBlob(repositoryId: string, blobOptions: ReadBlobOptions) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryBlob(repository, blobOptions);
    },

    async readCommit(repositoryId: string, commitRef: string) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryCommit(repository, commitRef);
    },

    async diff(repositoryId: string, diffOptions: DiffOptions) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryCompare(repository, diffOptions);
    },
  };
}

export { createContentMethods };
