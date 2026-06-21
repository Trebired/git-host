import { DEFAULT_MANAGED_EXCLUDE_PATTERNS } from "#r89qhx6c8mkf";
import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  CreateGitHostOptions,
  EnsureRepositoryOptions,
  GitRepositoryHandle,
  GitRepositorySummary,
  NormalizedGitHostLogger,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { RepositoryLockManager } from "#a08ndk3v0tpm";
import type { GitArchiveService } from "#1051qntat2i5";

function normalizeManagedExcludePatterns(value: unknown): string[] {
  const patterns = Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : [];
  return patterns.length ? patterns : Array.from(DEFAULT_MANAGED_EXCLUDE_PATTERNS);
}

function toGitHostError(error: unknown, fallbackCode: string, fallbackMessage: string): GitHostError {
  if (error instanceof GitHostError) return error;
  if (error instanceof Error) {
    return new GitHostError(fallbackCode, error.message || fallbackMessage);
  }
  return new GitHostError(fallbackCode, fallbackMessage);
}

type ResolveRepositoryFn = (repositoryId: string) => Promise<GitRepositoryHandle>;
type EnsureRepositoryInnerFn = (repositoryId: string, ensureOptions?: EnsureRepositoryOptions) => Promise<GitRepositoryHandle>;
type ReadSummaryForRepositoryFn = (repository: GitRepositoryHandle, commitLimit?: number) => Promise<GitRepositorySummary>;

type GitHostMethodContext = {
  archiveService: GitArchiveService;
  ensureRepositoryInner: EnsureRepositoryInnerFn;
  lockManager: RepositoryLockManager;
  logGroup: string;
  logger: NormalizedGitHostLogger;
  options: CreateGitHostOptions;
  readSummaryForRepository: ReadSummaryForRepositoryFn;
  resolveRepository: ResolveRepositoryFn;
  verbose: boolean;
};

export { normalizeManagedExcludePatterns, toGitHostError };
export type {
  EnsureRepositoryInnerFn,
  GitHostMethodContext,
  ReadSummaryForRepositoryFn,
  ResolveRepositoryFn,
};
