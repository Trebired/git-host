import type { GitRepositoryHandle, OpenArchiveOptions, ReadArchiveOptions, ResolveArchiveOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { assertRepositoryReady } from "#61bf255baf35";
import { resolveArchiveCommit } from "./commit.js";
import {
  archiveContentType,
  buildArchiveCacheKey,
  buildArchiveRootDirectory,
  normalizeArchiveFormat,
  resolveArchiveFileName,
  resolveArchiveRootDirectory,
} from "./shared.js";
import type { ResolvedArchiveRequest } from "./shared.js";
import type { ArchiveServiceContext } from "./context.js";

function createArchiveRequestLogger(context: ArchiveServiceContext) {
  return (repositoryId: string, optionsInput: ResolveArchiveOptions | OpenArchiveOptions | ReadArchiveOptions) => {
    context.logger.info(context.logGroup, "archive request received", {
      format: text(optionsInput.format, "tar.gz"),
      repositoryId,
      requested_ref: text(optionsInput.ref, "HEAD"),
    });
  };
}

function createResolvedRequestLogger(context: ArchiveServiceContext) {
  return (repository: GitRepositoryHandle, resolved: ResolvedArchiveRequest, cacheKey: string) => {
    context.logger.info(context.logGroup, "archive ref resolved", {
      cache_key: cacheKey,
      format: resolved.format,
      repositoryId: repository.id,
      requested_ref: resolved.ref,
      requested_format: resolved.requested_format,
      resolved_sha: resolved.resolved_commit,
    });
  };
}

function createResolveRequest(context: ArchiveServiceContext) {
  const logResolvedRequest = createResolvedRequestLogger(context);
  return async (repository: GitRepositoryHandle, optionsInput: ResolveArchiveOptions = {}): Promise<ResolvedArchiveRequest> => {
    await assertRepositoryReady(repository);
    const { format, requested } = normalizeArchiveFormat(optionsInput.format);
    const ref = text(optionsInput.ref, "HEAD");
    const resolvedCommit = await resolveArchiveCommit(repository, ref, format);
    const defaultRootDirectory = buildArchiveRootDirectory(repository.id, resolvedCommit);
    const fileName = resolveArchiveFileName(repository, context.archiveOptions, {
      fileName: optionsInput.fileName,
      format,
      ref,
      repositoryKey: optionsInput.repositoryKey,
      resolvedCommit,
      rootDirectory: defaultRootDirectory,
    });
    const rootDirectory = resolveArchiveRootDirectory(repository, context.archiveOptions, {
      fileName,
      format,
      ref,
      repositoryKey: optionsInput.repositoryKey,
      resolvedCommit,
      rootDirectory: optionsInput.rootDirectory,
    });
    const cacheKey = buildArchiveCacheKey(repository.id, resolvedCommit, format, context.cacheKeyVersion);
    const cacheEntry = context.cache.readEntry ? await context.cache.readEntry(cacheKey) : null;
    const resolved = { cache_entry: cacheEntry, content_type: archiveContentType(format), file_name: fileName, format, ref, requested_format: requested, resolved_commit: resolvedCommit, root_directory: rootDirectory };
    logResolvedRequest(repository, resolved, cacheKey);
    return resolved;
  };
}

function createResolveMethod(
  context: ArchiveServiceContext,
  maybeCleanupCache: ReturnType<typeof import("./context.js").createMaybeCleanupCache>,
  resolveRequest: ReturnType<typeof createResolveRequest>,
  buildMetadata: ReturnType<typeof import("./context.js").createMetadataBuilder>,
) {
  const logArchiveRequest = createArchiveRequestLogger(context);
  return async (repository: GitRepositoryHandle, optionsInput: ResolveArchiveOptions = {}) => {
    await maybeCleanupCache();
    logArchiveRequest(repository.id, optionsInput);
    const resolved = await resolveRequest(repository, optionsInput);
    return buildMetadata(repository, resolved, resolved.cache_entry ? "hit" : "miss", resolved.cache_entry?.size ?? null);
  };
}

export { createArchiveRequestLogger, createResolveMethod, createResolveRequest };
