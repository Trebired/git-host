import type {
  GitSourceArchiveLinks,
  ResolveArchiveLinksInput,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
import {
  buildArchiveRootDirectory,
  ensureRootDirectorySuffix,
  resolveArchiveFileName,
  resolveArchiveHref,
  resolveArchiveRootDirectory,
} from "./shared.js";
import type { ArchiveServiceContext } from "./context.js";

function createResolvedLink(
  context: ArchiveServiceContext,
  repositoryKey: string,
  input: ResolveArchiveLinksInput,
  ref: string,
  fileName: string,
  format: "tar.gz" | "zip",
  rootDirectory: string,
) {
  return {
    file_name: fileName,
    format,
    href: resolveArchiveHref(context.archiveOptions, repositoryKey, {
        basePath: input.basePath,
        fileName,
        format,
        ref,
        repositoryId: input.repositoryId,
        rootDirectory,
    }),
    ref,
    root_directory: rootDirectory,
  };
}

function resolveArchiveLinkParts(
  context: ArchiveServiceContext,
  repository: { id: string; path: string },
  repositoryKey: string,
  input: ResolveArchiveLinksInput,
  ref: string,
  format: "tar.gz" | "zip",
) {
  const defaultRootDirectory = buildArchiveRootDirectory(repository.id, ref);
  const fileName = resolveArchiveFileName(
    repository,
    context.archiveOptions,
    {
      fileName: input.fileName,
      format,
      ref,
      repositoryKey,
      rootDirectory: defaultRootDirectory,
    },
  );
  const rootDirectory =
  ensureRootDirectorySuffix(text(input.rootDirectory)) ||
    resolveArchiveRootDirectory(repository, context.archiveOptions, {
      fileName,
      format,
      ref,
      repositoryKey,
      rootDirectory: input.rootDirectory,
  });

  return createResolvedLink(
    context,
    repositoryKey,
    input,
    ref,
    fileName,
    format,
    rootDirectory,
  );
}

function createResolveLinksMethod(context: ArchiveServiceContext) {
  return (
    repositoryKey: string,
    input: ResolveArchiveLinksInput = {},
  ): GitSourceArchiveLinks => {
    const ref = text(input.ref, "HEAD");
    const repository = {
      id: text(input.repositoryId, repositoryKey),
      path: "",
    };
    return {
      tar_gz: resolveArchiveLinkParts(
        context,
        repository,
        repositoryKey,
        input,
        ref,
        "tar.gz",
      ),
      zip: resolveArchiveLinkParts(
        context,
        repository,
        repositoryKey,
        input,
        ref,
        "zip",
      ),
    };
  };
}

export { createResolveLinksMethod };
