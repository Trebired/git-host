import type {
  GitRepositoryHandle,
  OpenArchiveOptions,
  ReadArchiveOptions,
  ResolveArchiveOptions,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
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
  return (
    repositoryId: string,
    optionsInput:
    ResolveArchiveOptions | OpenArchiveOptions | ReadArchiveOptions,
  ) => {
    context.logger.info(context.logGroup, "archive request received", {
        format: text(optionsInput.format, "tar.gz"),
        repositoryId,
        requested_ref: text(optionsInput.ref, "HEAD"),
    });
  };
}

function createResolvedRequestLogger(context: ArchiveServiceContext) {
  return (
    repository: GitRepositoryHandle,
    resolved: ResolvedArchiveRequest,
    cacheKey: string,
  ) => {
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

async function readArchiveCacheEntry(
  context: ArchiveServiceContext,
  repository: GitRepositoryHandle,
  resolvedCommit: string,
  format: ReturnType<typeof normalizeArchiveFormat>["format"],
) {
  const cacheKey = buildArchiveCacheKey(
    repository.id,
    resolvedCommit,
    format,
    context.cacheKeyVersion,
  );
  const cacheEntry = context.cache.readEntry
  ? await context.cache.readEntry(cacheKey)
  : null;
  return { cacheEntry, cacheKey };
}

function resolveArchiveNaming(
  context: ArchiveServiceContext,
  repository: GitRepositoryHandle,
  optionsInput: ResolveArchiveOptions,
  input: {
    format: ReturnType<typeof normalizeArchiveFormat>["format"];
    ref: string;
    resolvedCommit: string;
  },
) {
  const defaultRootDirectory = buildArchiveRootDirectory(
    repository.id,
    input.resolvedCommit,
  );
  const fileName = resolveArchiveFileName(
    repository,
    context.archiveOptions,
    {
      fileName: optionsInput.fileName,
      format: input.format,
      ref: input.ref,
      repositoryKey: optionsInput.repositoryKey,
      resolvedCommit: input.resolvedCommit,
      rootDirectory: defaultRootDirectory,
    },
  );
  const rootDirectory = resolveArchiveRootDirectory(
    repository,
    context.archiveOptions,
    {
      fileName,
      format: input.format,
      ref: input.ref,
      repositoryKey: optionsInput.repositoryKey,
      resolvedCommit: input.resolvedCommit,
      rootDirectory: optionsInput.rootDirectory,
    },
  );
  return { fileName, rootDirectory };
}

function createResolveRequest(context: ArchiveServiceContext) {
  const logResolvedRequest = createResolvedRequestLogger(context);
  return async(
    repository: GitRepositoryHandle,
    optionsInput: ResolveArchiveOptions = {},
  ): Promise<ResolvedArchiveRequest> => {
    await assertRepositoryReady(repository);
    const { format, requested } = normalizeArchiveFormat(optionsInput.format);
    const ref = text(optionsInput.ref, "HEAD");
    const resolvedCommit = await resolveArchiveCommit(repository, ref, format);
    const naming = resolveArchiveNaming(
      context,
      repository,
      optionsInput,
      {
        format,
        ref,
        resolvedCommit,
      },
    );
    const { cacheEntry, cacheKey } = await readArchiveCacheEntry(
      context,
      repository,
      resolvedCommit,
      format,
    );
    const resolved = {
      cache_entry: cacheEntry,
      content_type: archiveContentType(format),
      file_name: naming.fileName,
      format,
      ref,
      requested_format: requested,
      resolved_commit: resolvedCommit,
      root_directory: naming.rootDirectory,
    };
    logResolvedRequest(repository, resolved, cacheKey);
    return resolved;
  };
}

function createResolveMethod(
  context: ArchiveServiceContext,
  maybeCleanupCache: ReturnType<
  typeof import("./context.js").createMaybeCleanupCache
  >,
  resolveRequest: ReturnType<typeof createResolveRequest>,
  buildMetadata: ReturnType<
  typeof import("./context.js").createMetadataBuilder
  >,
) {
  const logArchiveRequest = createArchiveRequestLogger(context);
  return async(
    repository: GitRepositoryHandle,
    optionsInput: ResolveArchiveOptions = {},
  ) => {
    await maybeCleanupCache();
    logArchiveRequest(repository.id, optionsInput);
    const resolved = await resolveRequest(repository, optionsInput);
    return buildMetadata(
      repository,
      resolved,
      resolved.cache_entry ? "hit" : "miss",
      resolved.cache_entry?.size ?? null,
    );
  };
}

export {
  createArchiveRequestLogger,
  createResolveMethod,
  createResolveRequest,
};
