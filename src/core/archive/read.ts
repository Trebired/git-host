import type { GitRepositoryHandle, ReadArchiveOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { assertRepositoryReady } from "#61bf255baf35";
import { archiveContentType, ensureRootDirectorySuffix, normalizeArchiveFormat, resolveArchiveFileName } from "./shared.js";
import type { ArchiveServiceContext, GitArchiveService } from "./context.js";
import { collectStream } from "./context.js";
import { resolveArchiveCommit } from "./commit.js";
import { spawnArchiveStream } from "./generation.js";

async function readArchiveThroughOpen(
  serviceRef: { current: GitArchiveService | null },
  repository: GitRepositoryHandle,
  optionsInput: ReadArchiveOptions,
  requestedRef: string,
) {
  const archive = await serviceRef.current!.open(repository, {
    fileName: optionsInput.fileName,
    format: optionsInput.format,
    ref: requestedRef,
    repositoryKey: optionsInput.repositoryKey,
    rootDirectory: optionsInput.rootDirectory,
  });
  const buffer = await collectStream(archive.stream);
  const metadata = await archive.completed;
  return { ...metadata, content: buffer.toString("base64"), encoding: "base64" as const };
}

async function readArchiveWithPrefix(
  context: ArchiveServiceContext,
  repository: GitRepositoryHandle,
  optionsInput: ReadArchiveOptions,
  requestedRef: string,
) {
  const { format } = normalizeArchiveFormat(optionsInput.format);
  await assertRepositoryReady(repository);
  const resolvedCommit = await resolveArchiveCommit(repository, requestedRef, format);
  const rootDirectory = ensureRootDirectorySuffix(text(optionsInput.prefix));
  const fileName = resolveArchiveFileName(repository, context.archiveOptions, {
    fileName: optionsInput.fileName,
    format,
    ref: requestedRef,
    repositoryKey: optionsInput.repositoryKey,
    resolvedCommit,
    rootDirectory,
  });
  const generation = spawnArchiveStream(repository, {
    format,
    ref: resolvedCommit,
    rootDirectory,
  });
  const buffer = await collectStream(generation.stream);
  await generation.completed;
  return {
    cache_key: "",
    cache_status: "miss" as const,
    content: buffer.toString("base64"),
    content_type: archiveContentType(format),
    encoding: "base64" as const,
    file_name: fileName,
    format,
    ref: requestedRef,
    resolved_commit: resolvedCommit,
    root_directory: rootDirectory,
    size: buffer.byteLength,
  };
}

function createReadMethod(
  context: ArchiveServiceContext,
  serviceRef: { current: GitArchiveService | null },
) {
  return async (repository: GitRepositoryHandle, optionsInput: ReadArchiveOptions = {}) => {
    const requestedRef = text(optionsInput.ref, "HEAD");
    if (!text(optionsInput.prefix)) return await readArchiveThroughOpen(serviceRef, repository, optionsInput, requestedRef);
    return await readArchiveWithPrefix(context, repository, optionsInput, requestedRef);
  };
}

export { createReadMethod };
