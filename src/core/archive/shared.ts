import { createHash } from "node:crypto";

import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  GitArchiveCacheEntry,
  GitArchiveFileNameContext,
  GitArchiveFormat,
  GitArchiveMetadata,
  GitHostArchiveOptions,
  GitArchiveRootDirectoryContext,
  GitArchiveUrlContext,
  GitRepositoryHandle,
  GitSourceArchiveFormat,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

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

function buildArchiveMetadata(
  repository: GitRepositoryHandle,
  resolved: ResolvedArchiveRequest,
  cacheKeyVersion: string,
  cacheStatus: "hit" | "miss",
  size: number | null,
): GitArchiveMetadata {
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

export {
  archiveContentType,
  archiveExtension,
  buildArchiveCacheKey,
  buildArchiveFileName,
  buildArchiveMetadata,
  buildArchivePath,
  buildArchiveRootDirectory,
  ensureRootDirectorySuffix,
  normalizeArchiveFormat,
  resolveArchiveFileName,
  resolveArchiveHref,
  resolveArchiveRootDirectory,
};
export type { ResolvedArchiveRequest };
