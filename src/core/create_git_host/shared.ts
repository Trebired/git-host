import { DEFAULT_MANAGED_EXCLUDE_PATTERNS } from "#0bba403f3e43";
import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitHostOptions,
  EnsureRepositoryOptions,
  GitRepositoryHandle,
  GitRepositorySummary,
  NormalizedGitHostLogger,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { RepositoryLockManager } from "#90040fe3e934";
import type { GitArchiveService } from "#07a96afa0a48";

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
