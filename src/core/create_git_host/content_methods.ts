import type {
  DiffOptions,
  GitHost,
  ListTreeOptions,
  ReadArchiveOptions,
  ReadBlameOptions,
  ReadBlobOptions,
  ReadLinguistOptions,
  SearchRepositoryOptions,
} from "../../types.js";
import {
  listRepositoryTree,
  readRepositoryArchive,
  readRepositoryBlame,
  readRepositoryBlob,
  readRepositoryCommit,
  readRepositoryCompare,
  readRepositoryLinguist,
  searchRepository,
} from "../inspect.js";
import type { GitHostMethodContext } from "./shared.js";

function createContentMethods(context: GitHostMethodContext): Pick<
  GitHost,
  "diff" | "listTree" | "readArchive" | "readBlame" | "readBlob" | "readCommit" | "readLinguist" | "search"
> {
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

    async readBlame(repositoryId: string, blameOptions: ReadBlameOptions) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryBlame(repository, blameOptions);
    },

    async readArchive(repositoryId: string, archiveOptions: ReadArchiveOptions = {}) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryArchive(repository, archiveOptions);
    },

    async readLinguist(repositoryId: string, linguistOptions: ReadLinguistOptions = {}) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryLinguist(repository, linguistOptions);
    },

    async diff(repositoryId: string, diffOptions: DiffOptions) {
      const repository = await resolveRepository(repositoryId);
      return await readRepositoryCompare(repository, diffOptions);
    },

    async search(repositoryId: string, searchOptions: SearchRepositoryOptions) {
      const repository = await resolveRepository(repositoryId);
      return await searchRepository(repository, searchOptions);
    },
  };
}

export { createContentMethods };
