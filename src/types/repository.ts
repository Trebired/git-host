type GitCommandResult = {
  code: number;
  ok: boolean;
  stderr: string;
  stdout: string;
};

type GitCommandBufferResult = {
  code: number;
  ok: boolean;
  stderr: string;
  stdout: Buffer;
};

type GitOperationKind = "" | "cherry-pick" | "merge" | "rebase" | "revert";

type GitOperationState = {
  can_abort: boolean;
  can_continue: boolean;
  in_progress: boolean;
  kind: GitOperationKind;
  label: string;
};

type GitStatusEntry = {
  code: string;
  conflicted: boolean;
  original_path: string;
  path: string;
  staged: boolean;
  untracked: boolean;
  unstaged: boolean;
};

type GitWorkingTreeEntry = GitStatusEntry & {
  staged_lines_added: number;
  staged_lines_removed: number;
  unstaged_lines_added: number;
  unstaged_lines_removed: number;
};

type GitRepositoryStatus = {
  ahead: number;
  behind: number;
  clean: boolean;
  conflicted: number;
  current_branch: string;
  entries: GitStatusEntry[];
  operation: GitOperationState;
  staged: number;
  untracked: number;
  unstaged: number;
  upstream: string;
};

type GitBranchSummary = {
  current: boolean;
  head_commit: string;
  name: string;
  upstream: string;
};

type GitRemoteSummary = {
  fetch_url: string;
  name: string;
  push_url: string;
};

type GitCommitSummary = {
  author_email: string;
  author_name: string;
  authored_at: string;
  hash: string;
  short_hash: string;
  subject: string;
};

type GitDiffFile = {
  change_kind: string;
  lines_added: number;
  lines_removed: number;
  original_path: string;
  path: string;
};

type GitCommitDetail = {
  commit: GitCommitSummary & {
    message: string;
    parent_hashes: string[];
  };
  diff: string;
  file_count: number;
  files: GitDiffFile[];
  lines_added: number;
  lines_removed: number;
};

type GitCompareSummary = {
  base_commit: string;
  base_ref: string;
  commit_count: number;
  commits: GitCommitSummary[];
  diff: string;
  file_count: number;
  files: GitDiffFile[];
  has_changes: boolean;
  head_commit: string;
  head_ref: string;
  lines_added: number;
  lines_removed: number;
  merge_base: string;
};

type GitTreeEntry = {
  mode: string;
  name: string;
  object: string;
  path: string;
  size: number | null;
  type: string;
};

type GitBlobEncoding = "base64" | "utf8";

type GitBlob = {
  content: string;
  encoding: GitBlobEncoding;
  is_binary: boolean;
  object: string;
  path: string;
  ref: string;
  size: number;
};

type GitFileContentSource = "staged" | "unstaged";

type GitFileContent = {
  content: string;
  encoding: GitBlobEncoding;
  is_binary: boolean;
  object: string | null;
  path: string;
  size: number;
  source: GitFileContentSource;
};

type GitWorkingTree = {
  conflicted_entries: GitWorkingTreeEntry[];
  entries: GitWorkingTreeEntry[];
  staged_diff: string;
  staged_entries: GitWorkingTreeEntry[];
  staged_lines_added: number;
  staged_lines_removed: number;
  status: GitRepositoryStatus;
  unstaged_diff: string;
  unstaged_entries: GitWorkingTreeEntry[];
  unstaged_lines_added: number;
  unstaged_lines_removed: number;
  untracked_entries: GitWorkingTreeEntry[];
};

type GitRepositoryHandle = {
  id: string;
  path: string;
};

type GitRepositorySummary = {
  branches: GitBranchSummary[];
  commits: GitCommitSummary[];
  remotes: GitRemoteSummary[];
  repository: {
    current_branch: string;
    default_branch: string;
    head_commit: string;
    head_short: string;
    id: string;
    path: string;
    remote_origin_url: string;
  };
  status: GitRepositoryStatus;
};

export type {
  GitBlob,
  GitBlobEncoding,
  GitBranchSummary,
  GitCommandBufferResult,
  GitCommandResult,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitDiffFile,
  GitFileContent,
  GitFileContentSource,
  GitOperationKind,
  GitOperationState,
  GitRemoteSummary,
  GitRepositoryHandle,
  GitRepositoryStatus,
  GitRepositorySummary,
  GitStatusEntry,
  GitTreeEntry,
  GitWorkingTree,
  GitWorkingTreeEntry,
};
