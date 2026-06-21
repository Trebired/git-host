type GitHostErrorCode =
  | "archive_access_denied"
  | "archive_format_not_supported"
  | "archive_generation_failed"
  | "archive_ref_not_found"
  | "git_command_failed"
  | "invalid_branch_name"
  | "path_not_blob"
  | "path_not_found"
  | "path_not_tree"
  | "release_tag_not_found"
  | "ref_not_found"
  | "repository_empty"
  | "invalid_repository_path"
  | "repository_unborn"
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
