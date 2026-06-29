import type { Writable } from "node:stream";

import type { MaybePromise } from "../common.js";
import type {
  GitArchiveFormat,
  GitArchiveMetadata,
  GitRepositoryHandle,
  GitSourceArchiveFormat,
  GitSourceArchiveLinks,
} from "../repository.js";

type ReadArchiveOptions = {
  fileName?: string;
  format?: GitArchiveFormat;
  prefix?: string;
  ref?: string;
  repositoryKey?: string;
  rootDirectory?: string;
};

type ResolveArchiveOptions = {
  fileName?: string;
  format?: GitArchiveFormat;
  ref?: string;
  repositoryKey?: string;
  rootDirectory?: string;
};

type OpenArchiveOptions = ResolveArchiveOptions & {
  preferRedirect?: boolean;
};

type ResolveArchiveLinksInput = {
  basePath?: string;
  fileName?: string;
  ref?: string;
  repositoryId?: string;
  rootDirectory?: string;
};

type GitArchiveFileNameContext = {
  defaultFileName: string;
  extension: string;
  format: GitSourceArchiveFormat;
  ref: string;
  repository: GitRepositoryHandle;
  repositoryId: string;
  repositoryKey?: string;
  resolvedCommit?: string;
  rootDirectory: string;
};

type GitArchiveRootDirectoryContext = {
  defaultRootDirectory: string;
  fileName: string;
  format: GitSourceArchiveFormat;
  ref: string;
  repository: GitRepositoryHandle;
  repositoryId: string;
  repositoryKey?: string;
  resolvedCommit?: string;
};

type GitArchiveUrlContext = {
  basePath: string;
  defaultPath: string;
  fileName?: string;
  format: GitSourceArchiveFormat;
  ref: string;
  repositoryId?: string;
  repositoryKey: string;
  rootDirectory?: string;
};

type GitArchiveCacheEntry = {
  content_type: string;
  created_at: string;
  expires_at: string;
  format: "tar.gz" | "zip";
  root_directory: string;
  size: number;
};

type GitArchiveCacheReadResult = {
  entry: GitArchiveCacheEntry;
  stream: NodeJS.ReadableStream;
};

type GitArchiveCacheWriter = {
  abort(): MaybePromise<void>;
  complete(entry: GitArchiveCacheEntry): MaybePromise<void>;
  stream: Writable;
};

type GitArchiveCacheBackend = {
  cleanupExpired?(now?: Date): MaybePromise<number>;
  createRedirectUrl?(
    cacheKey: string,
    entry: GitArchiveCacheEntry,
    input?: {
      expiresInMs?: number;
      metadata?: GitArchiveMetadata;
    },
  ): MaybePromise<string | null>;
  readEntry?(cacheKey: string): MaybePromise<GitArchiveCacheEntry | null>;
  openReadStream(cacheKey: string): MaybePromise<GitArchiveCacheReadResult | null>;
  prepareWrite(cacheKey: string): MaybePromise<GitArchiveCacheWriter | null>;
};

type GitHostArchiveOptions = {
  buildUrl?: (input: GitArchiveUrlContext) => string | null | undefined;
  cache?: GitArchiveCacheBackend;
  cacheKeyVersion?: string;
  cleanupIntervalMs?: number;
  resolveFileName?: (input: GitArchiveFileNameContext) => string | null | undefined;
  resolveRootDirectory?: (input: GitArchiveRootDirectoryContext) => string | null | undefined;
  redirectExpiresInMs?: number;
  ttlMs?: number;
};

export type {
  GitArchiveCacheBackend,
  GitArchiveCacheEntry,
  GitArchiveCacheReadResult,
  GitArchiveCacheWriter,
  GitArchiveFileNameContext,
  GitArchiveRootDirectoryContext,
  GitArchiveUrlContext,
  GitHostArchiveOptions,
  OpenArchiveOptions,
  ReadArchiveOptions,
  ResolveArchiveLinksInput,
  ResolveArchiveOptions,
};
