import os from "node:os";
import path from "node:path";

import type {
  GitArchive,
  GitArchiveCacheBackend,
  GitArchiveDownload,
  GitHostArchiveOptions,
  GitRepositoryHandle,
  GitSourceArchiveLinks,
  NormalizedGitHostLogger,
  OpenArchiveOptions,
  ReadArchiveOptions,
  ResolveArchiveLinksInput,
  ResolveArchiveOptions,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { createFileSystemGitArchiveCache } from "#42965357d713";
import { buildArchiveMetadata } from "./shared.js";
import type { ResolvedArchiveRequest } from "./shared.js";

type CreateGitArchiveServiceOptions = {
  archiveOptions?: GitHostArchiveOptions;
  logger: NormalizedGitHostLogger;
  logGroup?: string;
  verbose?: boolean;
};

type GitArchiveService = {
  open(repository: GitRepositoryHandle, options?: OpenArchiveOptions): Promise<GitArchiveDownload>;
  read(repository: GitRepositoryHandle, options?: ReadArchiveOptions): Promise<GitArchive>;
  resolve(repository: GitRepositoryHandle, options?: ResolveArchiveOptions): Promise<import("#1mbdfxwwqqpa").GitArchiveMetadata>;
  resolveLinks(repositoryKey: string, input?: ResolveArchiveLinksInput): GitSourceArchiveLinks;
};

type ArchiveServiceContext = {
  archiveOptions: GitHostArchiveOptions;
  cache: GitArchiveCacheBackend;
  cacheKeyVersion: string;
  cleanupIntervalMs: number;
  logGroup: string;
  logger: NormalizedGitHostLogger;
  redirectExpiresInMs: number;
  ttlMs: number;
  verbose: boolean;
};

function readPositiveNumber(value: unknown, fallback: number) {
  return Number(value) > 0 ? Number(value) : fallback;
}

function defaultArchiveCache(options?: GitHostArchiveOptions): GitArchiveCacheBackend {
  if (options?.cache) return options.cache;
  return createFileSystemGitArchiveCache({
    rootDir: path.join(os.tmpdir(), "@trebired-git-host", "archive-cache"),
  });
}

function createArchiveServiceContext(options: CreateGitArchiveServiceOptions): ArchiveServiceContext {
  const archiveOptions = options.archiveOptions || {};
  return {
    archiveOptions,
    cache: defaultArchiveCache(archiveOptions),
    cacheKeyVersion: text(archiveOptions.cacheKeyVersion, "v1"),
    cleanupIntervalMs: readPositiveNumber(archiveOptions.cleanupIntervalMs, 15 * 60 * 1000),
    logGroup: options.logGroup || "trebired.git-host.archive",
    logger: options.logger,
    redirectExpiresInMs: readPositiveNumber(archiveOptions.redirectExpiresInMs, 5 * 60 * 1000),
    ttlMs: readPositiveNumber(archiveOptions.ttlMs, 24 * 60 * 60 * 1000),
    verbose: options.verbose === true,
  };
}

function createMaybeCleanupCache(context: ArchiveServiceContext) {
  let lastCleanupAt = 0;
  return async () => {
    if (!context.cache.cleanupExpired) return;
    const now = Date.now();
    if ((now - lastCleanupAt) < context.cleanupIntervalMs) return;
    lastCleanupAt = now;
    try {
      await context.cache.cleanupExpired(new Date(now));
    } catch (error) {
      if (!context.verbose) return;
      context.logger.warn(context.logGroup, "archive cache cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks);
}

function createMetadataBuilder(context: ArchiveServiceContext) {
  return (repository: GitRepositoryHandle, resolved: ResolvedArchiveRequest, cacheStatus: "hit" | "miss", size: number | null) => (
    buildArchiveMetadata(repository, resolved, context.cacheKeyVersion, cacheStatus, size)
  );
}

export { collectStream, createArchiveServiceContext, createMaybeCleanupCache, createMetadataBuilder };
export type { ArchiveServiceContext, CreateGitArchiveServiceOptions, GitArchiveService };
