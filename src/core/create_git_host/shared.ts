import { DEFAULT_MANAGED_EXCLUDE_PATTERNS } from "../../constants.js";
import { GitHostError } from "../../errors.js";
import type {
  CreateGitHostOptions,
  EnsureRepositoryOptions,
  GitRepositoryHandle,
  GitRepositorySummary,
  NormalizedGitHostLogger,
} from "../../types.js";
import { text } from "../../utils/text.js";
import { RepositoryLockManager } from "../locks.js";

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
