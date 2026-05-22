type GitHostErrorCode =
  | "git_command_failed"
  | "invalid_branch_name"
  | "invalid_repository_path"
  | "repository_clone_target_not_empty"
  | "repository_not_found"
  | "repository_not_initialized";

class GitHostError extends Error {
  code: GitHostErrorCode | string;
  details: Record<string, unknown>;

  constructor(code: GitHostErrorCode | string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "GitHostError";
    this.code = code;
    this.details = details;
  }
}

function isGitHostError(value: unknown): value is GitHostError {
  return value instanceof GitHostError;
}

export { GitHostError, isGitHostError };
export type { GitHostErrorCode };
