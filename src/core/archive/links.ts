import type { GitSourceArchiveLinks, ResolveArchiveLinksInput } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { buildArchiveRootDirectory, ensureRootDirectorySuffix, resolveArchiveFileName, resolveArchiveHref, resolveArchiveRootDirectory } from "./shared.js";
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

function createResolveLinksMethod(context: ArchiveServiceContext) {
  return (repositoryKey: string, input: ResolveArchiveLinksInput = {}): GitSourceArchiveLinks => {
    const ref = text(input.ref, "HEAD");
    const repository = { id: text(input.repositoryId, repositoryKey), path: "" };
    const zipDefaultRoot = buildArchiveRootDirectory(repository.id, ref);
    const zipFileName = resolveArchiveFileName(repository, context.archiveOptions, {
      fileName: input.fileName,
      format: "zip",
      ref,
      repositoryKey,
      rootDirectory: zipDefaultRoot,
    });
    const zipRootDirectory = ensureRootDirectorySuffix(text(input.rootDirectory))
      || resolveArchiveRootDirectory(repository, context.archiveOptions, {
        fileName: zipFileName,
        format: "zip",
        ref,
        repositoryKey,
        rootDirectory: input.rootDirectory,
      });
    const tarDefaultRoot = buildArchiveRootDirectory(repository.id, ref);
    const tarFileName = resolveArchiveFileName(repository, context.archiveOptions, {
      fileName: input.fileName,
      format: "tar.gz",
      ref,
      repositoryKey,
      rootDirectory: tarDefaultRoot,
    });
    const tarRootDirectory = ensureRootDirectorySuffix(text(input.rootDirectory))
      || resolveArchiveRootDirectory(repository, context.archiveOptions, {
        fileName: tarFileName,
        format: "tar.gz",
        ref,
        repositoryKey,
        rootDirectory: input.rootDirectory,
      });
    return {
      tar_gz: createResolvedLink(context, repositoryKey, input, ref, tarFileName, "tar.gz", tarRootDirectory),
      zip: createResolvedLink(context, repositoryKey, input, ref, zipFileName, "zip", zipRootDirectory),
    };
  };
}

export { createResolveLinksMethod };
