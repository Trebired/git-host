import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";

import { GitHostError } from "#ebw9yuqcyi9w";
import type { GitArchiveCacheBackend, GitRepositoryHandle, OpenArchiveOptions } from "#1mbdfxwwqqpa";
import { buildArchiveCacheKey } from "./shared.js";
import type { ResolvedArchiveRequest } from "./shared.js";
import type { ArchiveServiceContext } from "./context.js";
import { createArchiveGenerationError } from "./commit.js";
import { spawnArchiveStream } from "./generation.js";
import { createArchiveRequestLogger } from "./resolve.js";

async function openCachedArchive(
  context: ArchiveServiceContext,
  repository: GitRepositoryHandle,
  resolved: ResolvedArchiveRequest,
  startedAt: number,
  buildMetadata: ReturnType<typeof import("./context.js").createMetadataBuilder>,
  optionsInput: OpenArchiveOptions,
) {
  const cacheKey = buildArchiveCacheKey(repository.id, resolved.resolved_commit, resolved.format, context.cacheKeyVersion);
  const cached = await context.cache.openReadStream(cacheKey);
  if (!cached) return null;
  const metadata = buildMetadata(repository, resolved, "hit", cached.entry.size);
  context.logger.info(context.logGroup, "archive cache hit", {
    cache_key: cacheKey,
    cache_status: "hit",
    duration_ms: Date.now() - startedAt,
    format: resolved.format,
    repositoryId: repository.id,
    requested_ref: resolved.ref,
    resolved_sha: resolved.resolved_commit,
  });
  return {
    completed: Promise.resolve(metadata),
    metadata,
    redirect_url: optionsInput.preferRedirect && context.cache.createRedirectUrl
      ? await context.cache.createRedirectUrl(cacheKey, cached.entry, { expiresInMs: context.redirectExpiresInMs, metadata })
      : undefined,
    stream: cached.stream as NodeJS.ReadableStream,
  };
}

function trackGeneratedArchiveSize(stream: NodeJS.ReadableStream) {
  let size = 0;
  stream.on("data", (chunk) => {
    size += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk));
  });
  return () => size;
}

async function finalizeArchiveWrite(
  writer: NonNullable<Awaited<ReturnType<GitArchiveCacheBackend["prepareWrite"]>>>,
  resolved: ResolvedArchiveRequest,
  size: number,
  ttlMs: number,
) {
  await finished(writer.stream);
  await writer.complete({
    content_type: resolved.content_type,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    format: resolved.format,
    root_directory: resolved.root_directory,
    size,
  });
}

function createGenerationFailureLogger(
  context: ArchiveServiceContext,
  repository: GitRepositoryHandle,
  resolved: ResolvedArchiveRequest,
  startedAt: number,
) {
  return (error: GitHostError) => {
    context.logger.error(context.logGroup, "archive generation failed", {
      cache_key: buildArchiveCacheKey(repository.id, resolved.resolved_commit, resolved.format, context.cacheKeyVersion),
      cache_status: "miss",
      duration_ms: Date.now() - startedAt,
      error: error.message,
      format: resolved.format,
      repositoryId: repository.id,
      requested_ref: resolved.ref,
      resolved_sha: resolved.resolved_commit,
    });
  };
}

function completeGeneratedArchive(
  context: ArchiveServiceContext,
  repository: GitRepositoryHandle,
  resolved: ResolvedArchiveRequest,
  startedAt: number,
  writer: Awaited<ReturnType<GitArchiveCacheBackend["prepareWrite"]>>,
  generationCompleted: Promise<void>,
  responseStream: PassThrough,
  readSize: () => number,
  buildMetadata: ReturnType<typeof import("./context.js").createMetadataBuilder>,
) {
  const logFailure = createGenerationFailureLogger(context, repository, resolved, startedAt);
  return new Promise<import("#1mbdfxwwqqpa").GitArchiveMetadata>((resolve, reject) => {
    const fail = async (error: unknown) => {
      try {
        if (writer) await writer.abort();
      } catch {}
      const normalized = error instanceof GitHostError
        ? error
        : createArchiveGenerationError(repository, resolved.ref, resolved.format, error instanceof Error ? error.message : "");
      logFailure(normalized);
      responseStream.destroy(normalized);
      reject(normalized);
    };
    responseStream.on("error", (error) => {
      void fail(error);
    });
    if (writer) writer.stream.on("error", (error) => {
      void fail(error);
    });
    void generationCompleted.then(async () => {
      try {
        const size = readSize();
        if (writer) await finalizeArchiveWrite(writer, resolved, size, context.ttlMs);
        const metadata = buildMetadata(repository, resolved, "miss", size);
        context.logger.info(context.logGroup, "archive generation finished", {
          cache_key: buildArchiveCacheKey(repository.id, resolved.resolved_commit, resolved.format, context.cacheKeyVersion),
          cache_status: "miss",
          duration_ms: Date.now() - startedAt,
          format: resolved.format,
          repositoryId: repository.id,
          requested_ref: resolved.ref,
          resolved_sha: resolved.resolved_commit,
        });
        resolve(metadata);
      } catch (error) {
        await fail(error);
      }
    }).catch(async (error) => {
      await fail(error);
    });
  });
}

async function openGeneratedArchive(
  context: ArchiveServiceContext,
  repository: GitRepositoryHandle,
  resolved: ResolvedArchiveRequest,
  startedAt: number,
  cacheKey: string,
  metadataFromCache: import("#1mbdfxwwqqpa").GitArchiveMetadata,
  buildMetadata: ReturnType<typeof import("./context.js").createMetadataBuilder>,
) {
  context.logger.info(context.logGroup, "archive cache miss", {
    cache_key: cacheKey,
    cache_status: "miss",
    format: resolved.format,
    repositoryId: repository.id,
    requested_ref: resolved.ref,
    resolved_sha: resolved.resolved_commit,
  });
  const writer = await context.cache.prepareWrite(cacheKey);
  const generation = spawnArchiveStream(repository, {
    format: resolved.format,
    ref: resolved.resolved_commit,
    rootDirectory: resolved.root_directory,
  });
  const responseStream = new PassThrough();
  const readSize = trackGeneratedArchiveSize(generation.stream);
  generation.stream.pipe(responseStream);
  if (writer) generation.stream.pipe(writer.stream);
  context.logger.info(context.logGroup, "archive generation started", {
    cache_key: cacheKey,
    cache_status: "miss",
    format: resolved.format,
    repositoryId: repository.id,
    requested_ref: resolved.ref,
    resolved_sha: resolved.resolved_commit,
  });
  const completed = completeGeneratedArchive(context, repository, resolved, startedAt, writer, generation.completed, responseStream, readSize, buildMetadata);
  return { completed, metadata: metadataFromCache, stream: responseStream };
}

function createOpenMethod(
  context: ArchiveServiceContext,
  maybeCleanupCache: ReturnType<typeof import("./context.js").createMaybeCleanupCache>,
  resolveRequest: ReturnType<typeof import("./resolve.js").createResolveRequest>,
  buildMetadata: ReturnType<typeof import("./context.js").createMetadataBuilder>,
) {
  const logArchiveRequest = createArchiveRequestLogger(context);
  return async (repository: GitRepositoryHandle, optionsInput: OpenArchiveOptions = {}) => {
    await maybeCleanupCache();
    const startedAt = Date.now();
    logArchiveRequest(repository.id, optionsInput);
    const resolved = await resolveRequest(repository, optionsInput);
    const cacheKey = buildArchiveCacheKey(repository.id, resolved.resolved_commit, resolved.format, context.cacheKeyVersion);
    const metadataFromCache = buildMetadata(repository, resolved, resolved.cache_entry ? "hit" : "miss", resolved.cache_entry?.size ?? null);
    const cached = await openCachedArchive(context, repository, resolved, startedAt, buildMetadata, optionsInput);
    if (cached) return cached;
    return await openGeneratedArchive(context, repository, resolved, startedAt, cacheKey, metadataFromCache, buildMetadata);
  };
}

export { createOpenMethod };
