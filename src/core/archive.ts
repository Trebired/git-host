import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { GitHostError } from "../errors.js";
import type {
  GitArchive,
  GitArchiveCacheBackend,
  GitArchiveCacheEntry,
  GitArchiveDownload,
  GitArchiveFileNameContext,
  GitArchiveFormat,
  GitArchiveMetadata,
  GitHostArchiveOptions,
  GitArchiveRootDirectoryContext,
  GitArchiveUrlContext,
  GitRepositoryHandle,
  GitSourceArchiveFormat,
  GitSourceArchiveLinks,
  NormalizedGitHostLogger,
  OpenArchiveOptions,
  ReadArchiveOptions,
  ResolveArchiveLinksInput,
  ResolveArchiveOptions,
} from "../types.js";
import { text } from "../utils/text.js";
import { assertRepositoryReady } from "./inspect/helpers.js";
import { runGit } from "./run_git.js";
import { createFileSystemGitArchiveCache } from "./archive_cache_filesystem.js";

type CreateGitArchiveServiceOptions = {
  archiveOptions?: GitHostArchiveOptions;
  logger: NormalizedGitHostLogger;
  logGroup?: string;
  verbose?: boolean;
};

type GitArchiveService = {
  open(repository: GitRepositoryHandle, options?: OpenArchiveOptions): Promise<GitArchiveDownload>;
  read(repository: GitRepositoryHandle, options?: ReadArchiveOptions): Promise<GitArchive>;
  resolve(repository: GitRepositoryHandle, options?: ResolveArchiveOptions): Promise<GitArchiveMetadata>;
  resolveLinks(repositoryKey: string, input?: ResolveArchiveLinksInput): GitSourceArchiveLinks;
};

type ResolvedArchiveRequest = {
  cache_entry: GitArchiveCacheEntry | null;
  content_type: string;
  file_name: string;
  format: GitSourceArchiveFormat;
  ref: string;
  requested_format: GitArchiveFormat;
  resolved_commit: string;
  root_directory: string;
};

function normalizeArchiveFormat(value: unknown): {
  format: GitSourceArchiveFormat;
  requested: GitArchiveFormat;
} {
  const requested = text(value, "tar.gz");
  if (requested === "zip") return { format: "zip", requested: "zip" };
  if (requested === "tar" || requested === "tar.gz" || !requested) return { format: "tar.gz", requested: requested === "tar" ? "tar" : "tar.gz" };
  throw new GitHostError("archive_format_not_supported", `Archive format "${requested}" is not supported.`, {
    format: requested,
  });
}

function sanitizeArchiveComponent(value: string): string {
  return text(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "archive";
}

function archiveExtension(format: GitSourceArchiveFormat): string {
  return format === "zip" ? "zip" : "tar.gz";
}

function archiveContentType(format: GitSourceArchiveFormat): string {
  return format === "zip" ? "application/zip" : "application/gzip";
}

function buildArchiveCacheKey(repositoryId: string, resolvedCommit: string, format: GitSourceArchiveFormat, version: string): string {
  return createHash("sha256").update(`${repositoryId}\u001f${resolvedCommit}\u001f${format}\u001f${version}`).digest("hex");
}

function buildArchiveRootDirectory(repositoryId: string, resolvedCommit: string): string {
  return `${sanitizeArchiveComponent(repositoryId)}-${sanitizeArchiveComponent(resolvedCommit.slice(0, 12))}/`;
}

function buildArchiveFileName(repositoryId: string, ref: string, format: GitSourceArchiveFormat): string {
  return `${sanitizeArchiveComponent(repositoryId)}-${sanitizeArchiveComponent(ref || "HEAD")}.${archiveExtension(format)}`;
}

function ensureArchiveFileNameExtension(fileName: string, format: GitSourceArchiveFormat): string {
  const trimmed = text(fileName).replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  const extension = `.${archiveExtension(format)}`;
  return trimmed.endsWith(extension) ? trimmed : `${trimmed}${extension}`;
}

function ensureRootDirectorySuffix(value: string): string {
  const trimmed = text(value).replace(/^\/+/g, "").replace(/\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
}

function normalizeBasePath(value: unknown): string {
  const next = text(value).replace(/\/+$/g, "");
  if (!next || next === "/") return "";
  return next.startsWith("/") ? next : `/${next}`;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function buildArchivePath(repositoryKey: string, format: GitSourceArchiveFormat, ref: string, basePath?: string): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const route = format === "zip" ? "zipball" : "tarball";
  return `${normalizedBasePath}/repositories/${encodePathSegment(repositoryKey)}/${route}/${encodePathSegment(ref || "HEAD")}`;
}

function resolveArchiveFileName(
  repository: GitRepositoryHandle,
  archiveOptions: GitHostArchiveOptions,
  input: {
    fileName?: string;
    format: GitSourceArchiveFormat;
    ref: string;
    repositoryKey?: string;
    resolvedCommit?: string;
    rootDirectory: string;
  },
): string {
  const defaultFileName = buildArchiveFileName(repository.id, input.ref, input.format);
  const hookInput: GitArchiveFileNameContext = {
    defaultFileName,
    extension: archiveExtension(input.format),
    format: input.format,
    ref: input.ref,
    repository,
    repositoryId: repository.id,
    repositoryKey: input.repositoryKey,
    resolvedCommit: input.resolvedCommit,
    rootDirectory: input.rootDirectory,
  };
  const candidate = text(input.fileName) || text(archiveOptions.resolveFileName?.(hookInput)) || defaultFileName;
  return ensureArchiveFileNameExtension(candidate, input.format) || defaultFileName;
}

function resolveArchiveRootDirectory(
  repository: GitRepositoryHandle,
  archiveOptions: GitHostArchiveOptions,
  input: {
    fileName: string;
    format: GitSourceArchiveFormat;
    ref: string;
    repositoryKey?: string;
    resolvedCommit?: string;
    rootDirectory?: string;
  },
): string {
  const defaultRootDirectory = buildArchiveRootDirectory(repository.id, text(input.resolvedCommit));
  const hookInput: GitArchiveRootDirectoryContext = {
    defaultRootDirectory,
    fileName: input.fileName,
    format: input.format,
    ref: input.ref,
    repository,
    repositoryId: repository.id,
    repositoryKey: input.repositoryKey,
    resolvedCommit: input.resolvedCommit,
  };
  const candidate = ensureRootDirectorySuffix(
    text(input.rootDirectory)
    || text(archiveOptions.resolveRootDirectory?.(hookInput))
    || defaultRootDirectory,
  );
  return candidate || defaultRootDirectory;
}

function resolveArchiveHref(
  archiveOptions: GitHostArchiveOptions,
  repositoryKey: string,
  input: {
    basePath?: string;
    fileName?: string;
    format: GitSourceArchiveFormat;
    ref: string;
    repositoryId?: string;
    rootDirectory?: string;
  },
): string {
  const normalizedBasePath = normalizeBasePath(input.basePath);
  const defaultPath = buildArchivePath(repositoryKey, input.format, input.ref, normalizedBasePath);
  const hookInput: GitArchiveUrlContext = {
    basePath: normalizedBasePath,
    defaultPath,
    fileName: input.fileName,
    format: input.format,
    ref: input.ref,
    repositoryId: input.repositoryId,
    repositoryKey,
    rootDirectory: input.rootDirectory,
  };
  return text(archiveOptions.buildUrl?.(hookInput), defaultPath);
}

async function resolveArchiveCommit(repository: GitRepositoryHandle, ref: string, format: GitSourceArchiveFormat): Promise<string> {
  const commitRes = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: repository.path,
  });
  if (commitRes.ok) return text(commitRes.stdout);

  const headRes = await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
    cwd: repository.path,
  });
  if (!headRes.ok) {
    throw new GitHostError(
      "repository_empty",
      `Repository "${repository.id}" is empty, so ref "${ref}" cannot be archived as "${format}".`,
      {
        format,
        ref,
        repositoryId: repository.id,
      },
    );
  }

  throw new GitHostError(
    "archive_ref_not_found",
    `Archive ref "${ref}" was not found in repository "${repository.id}" for format "${format}".`,
    {
      format,
      ref,
      repositoryId: repository.id,
    },
  );
}

function defaultArchiveCache(options?: GitHostArchiveOptions): GitArchiveCacheBackend {
  if (options?.cache) return options.cache;
  return createFileSystemGitArchiveCache({
    rootDir: path.join(os.tmpdir(), "@trebired-git-host", "archive-cache"),
  });
}

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function createArchiveGenerationError(
  repository: GitRepositoryHandle,
  ref: string,
  format: GitSourceArchiveFormat,
  stderr: string,
): GitHostError {
  return new GitHostError(
    "archive_generation_failed",
    text(stderr, `Failed to generate archive "${format}" for ref "${ref}" in repository "${repository.id}".`),
    {
      format,
      ref,
      repositoryId: repository.id,
    },
  );
}

function spawnArchiveStream(repository: GitRepositoryHandle, input: {
  format: GitSourceArchiveFormat;
  ref: string;
  rootDirectory: string;
}): {
  completed: Promise<void>;
  stream: NodeJS.ReadableStream;
} {
  const gitArgs = [
    "archive",
    input.format === "zip" ? "--format=zip" : "--format=tar",
    `--prefix=${input.rootDirectory}`,
    input.ref,
  ];
  const child = spawn("git", gitArgs, {
    cwd: repository.path,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = input.format === "zip"
    ? child.stdout
    : child.stdout.pipe(createGzip());
  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const completed = new Promise<void>((resolve, reject) => {
    let gitDone = false;
    let streamDone = false;
    let settled = false;

    const maybeResolve = () => {
      if (!settled && gitDone && streamDone) {
        settled = true;
        resolve();
      }
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof GitHostError
        ? error
        : createArchiveGenerationError(repository, input.ref, input.format, stderr || (error instanceof Error ? error.message : "")));
    };

    child.on("error", fail);
    child.on("close", (code) => {
      if (Number(code) !== 0) {
        fail(createArchiveGenerationError(repository, input.ref, input.format, stderr));
        return;
      }
      gitDone = true;
      maybeResolve();
    });

    void finished(output).then(() => {
      streamDone = true;
      maybeResolve();
    }).catch(fail);
  });

  return {
    completed,
    stream: output,
  };
}

function createGitArchiveService(options: CreateGitArchiveServiceOptions): GitArchiveService {
  const logger = options.logger;
  const logGroup = options.logGroup || "git-host.archive";
  const verbose = options.verbose === true;
  const archiveOptions = options.archiveOptions || {};
  const cache = defaultArchiveCache(archiveOptions);
  const cacheKeyVersion = text(archiveOptions.cacheKeyVersion, "v1");
  const cleanupIntervalMs = Number(archiveOptions.cleanupIntervalMs) > 0 ? Number(archiveOptions.cleanupIntervalMs) : 15 * 60 * 1000;
  const redirectExpiresInMs = Number(archiveOptions.redirectExpiresInMs) > 0 ? Number(archiveOptions.redirectExpiresInMs) : 5 * 60 * 1000;
  const ttlMs = Number(archiveOptions.ttlMs) > 0 ? Number(archiveOptions.ttlMs) : 24 * 60 * 60 * 1000;
  let lastCleanupAt = 0;

  async function maybeCleanupCache(): Promise<void> {
    if (!cache.cleanupExpired) return;
    const now = Date.now();
    if ((now - lastCleanupAt) < cleanupIntervalMs) return;
    lastCleanupAt = now;
    try {
      await cache.cleanupExpired(new Date(now));
    } catch (error) {
      if (verbose) {
        logger.warn(logGroup, "archive cache cleanup failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async function resolveRequest(repository: GitRepositoryHandle, optionsInput: ResolveArchiveOptions = {}): Promise<ResolvedArchiveRequest> {
    await assertRepositoryReady(repository);
    const { format, requested } = normalizeArchiveFormat(optionsInput.format);
    const ref = text(optionsInput.ref, "HEAD");
    const resolvedCommit = await resolveArchiveCommit(repository, ref, format);
    const defaultRootDirectory = buildArchiveRootDirectory(repository.id, resolvedCommit);
    const fileName = resolveArchiveFileName(repository, archiveOptions, {
      fileName: optionsInput.fileName,
      format,
      ref,
      repositoryKey: optionsInput.repositoryKey,
      resolvedCommit,
      rootDirectory: defaultRootDirectory,
    });
    const rootDirectory = resolveArchiveRootDirectory(repository, archiveOptions, {
      fileName,
      format,
      ref,
      repositoryKey: optionsInput.repositoryKey,
      resolvedCommit,
      rootDirectory: optionsInput.rootDirectory,
    });
    const cacheKey = buildArchiveCacheKey(repository.id, resolvedCommit, format, cacheKeyVersion);
    const cacheEntry = cache.readEntry ? await cache.readEntry(cacheKey) : null;

    logger.info(logGroup, "archive ref resolved", {
      cache_key: cacheKey,
      format,
      repositoryId: repository.id,
      requested_ref: ref,
      requested_format: requested,
      resolved_sha: resolvedCommit,
    });

    return {
      cache_entry: cacheEntry,
      content_type: archiveContentType(format),
      file_name: fileName,
      format,
      ref,
      requested_format: requested,
      resolved_commit: resolvedCommit,
      root_directory: rootDirectory,
    };
  }

  function buildMetadata(repository: GitRepositoryHandle, resolved: ResolvedArchiveRequest, cacheStatus: "hit" | "miss", size: number | null): GitArchiveMetadata {
    return {
      cache_key: buildArchiveCacheKey(repository.id, resolved.resolved_commit, resolved.format, cacheKeyVersion),
      cache_status: cacheStatus,
      content_type: resolved.content_type,
      file_name: resolved.file_name,
      format: resolved.format,
      ref: resolved.ref,
      resolved_commit: resolved.resolved_commit,
      root_directory: resolved.root_directory,
      size,
    };
  }

  const service: GitArchiveService = {
    async resolve(repository, optionsInput = {}) {
      await maybeCleanupCache();
      logger.info(logGroup, "archive request received", {
        format: text(optionsInput.format, "tar.gz"),
        repositoryId: repository.id,
        requested_ref: text(optionsInput.ref, "HEAD"),
      });
      const resolved = await resolveRequest(repository, optionsInput);
      return buildMetadata(repository, resolved, resolved.cache_entry ? "hit" : "miss", resolved.cache_entry?.size ?? null);
    },

    async open(repository, optionsInput = {}) {
      await maybeCleanupCache();
      const startedAt = Date.now();
      logger.info(logGroup, "archive request received", {
        format: text(optionsInput.format, "tar.gz"),
        repositoryId: repository.id,
        requested_ref: text(optionsInput.ref, "HEAD"),
      });

      const resolved = await resolveRequest(repository, optionsInput);
      const cacheKey = buildArchiveCacheKey(repository.id, resolved.resolved_commit, resolved.format, cacheKeyVersion);
      const metadataFromCache = buildMetadata(repository, resolved, resolved.cache_entry ? "hit" : "miss", resolved.cache_entry?.size ?? null);

      const cached = await cache.openReadStream(cacheKey);
      if (cached) {
        const metadata = buildMetadata(repository, resolved, "hit", cached.entry.size);
        logger.info(logGroup, "archive cache hit", {
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
          redirect_url: optionsInput.preferRedirect && cache.createRedirectUrl
            ? await cache.createRedirectUrl(cacheKey, cached.entry, { expiresInMs: redirectExpiresInMs, metadata })
            : undefined,
          stream: cached.stream as NodeJS.ReadableStream,
        };
      }

      logger.info(logGroup, "archive cache miss", {
        cache_key: cacheKey,
        cache_status: "miss",
        format: resolved.format,
        repositoryId: repository.id,
        requested_ref: resolved.ref,
        resolved_sha: resolved.resolved_commit,
      });

      const writer = await cache.prepareWrite(cacheKey);
      const generation = spawnArchiveStream(repository, {
        format: resolved.format,
        ref: resolved.resolved_commit,
        rootDirectory: resolved.root_directory,
      });
      const responseStream = new PassThrough();
      let size = 0;

      generation.stream.on("data", (chunk) => {
        size += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk));
      });
      generation.stream.pipe(responseStream);
      if (writer) generation.stream.pipe(writer.stream);

      logger.info(logGroup, "archive generation started", {
        cache_key: cacheKey,
        cache_status: "miss",
        format: resolved.format,
        repositoryId: repository.id,
        requested_ref: resolved.ref,
        resolved_sha: resolved.resolved_commit,
      });

      const completed = new Promise<GitArchiveMetadata>((resolve, reject) => {
        const fail = async (error: unknown) => {
          try {
            if (writer) await writer.abort();
          } catch {}
          const normalized = error instanceof GitHostError
            ? error
            : createArchiveGenerationError(repository, resolved.ref, resolved.format, error instanceof Error ? error.message : "");
          logger.error(logGroup, "archive generation failed", {
            cache_key: cacheKey,
            cache_status: "miss",
            duration_ms: Date.now() - startedAt,
            error: normalized.message,
            format: resolved.format,
            repositoryId: repository.id,
            requested_ref: resolved.ref,
            resolved_sha: resolved.resolved_commit,
          });
          responseStream.destroy(normalized);
          reject(normalized);
        };

        responseStream.on("error", (error) => {
          void fail(error);
        });
        if (writer) {
          writer.stream.on("error", (error) => {
            void fail(error);
          });
        }

        void generation.completed.then(async () => {
          try {
            if (writer) {
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
            const metadata = buildMetadata(repository, resolved, "miss", size);
            logger.info(logGroup, "archive generation finished", {
              cache_key: cacheKey,
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

      return {
        completed,
        metadata: metadataFromCache,
        stream: responseStream,
      };
    },

    async read(repository, optionsInput = {}) {
      const requestedRef = text(optionsInput.ref, "HEAD");
      if (text(optionsInput.prefix)) {
        const { format } = normalizeArchiveFormat(optionsInput.format);
        await assertRepositoryReady(repository);
        const resolvedCommit = await resolveArchiveCommit(repository, requestedRef, format);
        const rootDirectory = ensureRootDirectorySuffix(text(optionsInput.prefix));
        const fileName = resolveArchiveFileName(repository, archiveOptions, {
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
          cache_status: "miss",
          content: buffer.toString("base64"),
          content_type: archiveContentType(format),
          encoding: "base64",
          file_name: fileName,
          format,
          ref: requestedRef,
          resolved_commit: resolvedCommit,
          root_directory: rootDirectory,
          size: buffer.byteLength,
        };
      }

      const archive = await service.open(repository, {
        fileName: optionsInput.fileName,
        format: optionsInput.format,
        ref: requestedRef,
        repositoryKey: optionsInput.repositoryKey,
        rootDirectory: optionsInput.rootDirectory,
      });
      const buffer = await collectStream(archive.stream);
      const metadata = await archive.completed;
      return {
        ...metadata,
        content: buffer.toString("base64"),
        encoding: "base64",
      };
    },

    resolveLinks(repositoryKey, input = {}) {
      const ref = text(input.ref, "HEAD");
      const repository = {
        id: text(input.repositoryId, repositoryKey),
        path: "",
      };

      const zipDefaultRoot = buildArchiveRootDirectory(repository.id, ref);
      const zipFileName = resolveArchiveFileName(repository, archiveOptions, {
        fileName: input.fileName,
        format: "zip",
        ref,
        repositoryKey,
        rootDirectory: zipDefaultRoot,
      });
      const zipRootDirectory = ensureRootDirectorySuffix(text(input.rootDirectory))
        || resolveArchiveRootDirectory(repository, archiveOptions, {
          fileName: zipFileName,
          format: "zip",
          ref,
          repositoryKey,
          rootDirectory: input.rootDirectory,
        });

      const tarDefaultRoot = buildArchiveRootDirectory(repository.id, ref);
      const tarFileName = resolveArchiveFileName(repository, archiveOptions, {
        fileName: input.fileName,
        format: "tar.gz",
        ref,
        repositoryKey,
        rootDirectory: tarDefaultRoot,
      });
      const tarRootDirectory = ensureRootDirectorySuffix(text(input.rootDirectory))
        || resolveArchiveRootDirectory(repository, archiveOptions, {
          fileName: tarFileName,
          format: "tar.gz",
          ref,
          repositoryKey,
          rootDirectory: input.rootDirectory,
        });

      return {
        tar_gz: {
          file_name: tarFileName,
          format: "tar.gz",
          href: resolveArchiveHref(archiveOptions, repositoryKey, {
            basePath: input.basePath,
            fileName: tarFileName,
            format: "tar.gz",
            ref,
            repositoryId: input.repositoryId,
            rootDirectory: tarRootDirectory,
          }),
          ref,
          root_directory: tarRootDirectory,
        },
        zip: {
          file_name: zipFileName,
          format: "zip",
          href: resolveArchiveHref(archiveOptions, repositoryKey, {
            basePath: input.basePath,
            fileName: zipFileName,
            format: "zip",
            ref,
            repositoryId: input.repositoryId,
            rootDirectory: zipRootDirectory,
          }),
          ref,
          root_directory: zipRootDirectory,
        },
      };
    },
  };

  return service;
}

export { buildArchivePath, createGitArchiveService, normalizeArchiveFormat };
export type { CreateGitArchiveServiceOptions, GitArchiveService };
