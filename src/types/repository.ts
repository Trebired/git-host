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

type GitTagSummary = {
  annotated: boolean;
  hash: string;
  name: string;
  short_hash: string;
  subject: string;
  tagged_at: string;
  tagger_email: string;
  tagger_name: string;
  target_hash: string;
  target_short_hash: string;
  target_type: string;
};

type GitTagDetail = GitTagSummary & {
  message: string;
};

type GitBlameLine = {
  author_email: string;
  author_name: string;
  authored_at: string;
  commit_hash: string;
  commit_short_hash: string;
  content: string;
  line_number: number;
  original_line_number: number;
  summary: string;
};

type GitBlame = {
  lines: GitBlameLine[];
  path: string;
  ref: string;
};

type GitSearchMatch = {
  column: number;
  line: string;
  line_number: number;
};

type GitSearchFileResult = {
  match_count: number;
  matches: GitSearchMatch[];
  path: string;
};

type GitSearchResult = {
  files: GitSearchFileResult[];
  match_count: number;
  query: string;
  ref: string;
  truncated: boolean;
};

type GitRepositoryLinguistLines = {
  content: number;
  total: number;
};

type GitRepositoryLinguistLanguage = {
  bytes: number;
  color?: string;
  count: number;
  lines: GitRepositoryLinguistLines;
  parent?: string;
  type: string;
};

type GitTreeEntryIcon = {
  name: string;
  svg: string;
};

type GitTreeEntry = {
  icon?: GitTreeEntryIcon | null;
  language?: string | null;
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

type GitArchiveFormat = "tar" | "zip";

type GitArchive = {
  content: string;
  content_type: string;
  encoding: "base64";
  file_name: string;
  format: GitArchiveFormat;
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

type GitRepositoryLinguist = {
  commit: string;
  files: {
    bytes: number;
    count: number;
    lines: GitRepositoryLinguistLines;
    results: Record<string, string | null>;
  };
  languages: {
    bytes: number;
    count: number;
    lines: GitRepositoryLinguistLines;
    results: Record<string, GitRepositoryLinguistLanguage>;
  };
  ref: string;
  unknown: {
    bytes: number;
    count: number;
    extensions: Record<string, number>;
    filenames: Record<string, number>;
    lines: GitRepositoryLinguistLines;
  };
};

type GitLinguistProgressStage =
  | "queued"
  | "resolving_ref"
  | "listing_tree"
  | "reading_blobs"
  | "analyzing"
  | "completed"
  | "failed";

type GitLinguistProgressEvent = {
  commit?: string;
  emitted_at: string;
  error?: {
    code: string;
    message: string;
  };
  message: string;
  percent: number;
  processed_blobs: number;
  ref: string;
  repository_id: string;
  scan_id: string;
  stage: GitLinguistProgressStage;
  total_blobs: number;
  total_entries: number;
};

export type {
  GitArchive,
  GitArchiveFormat,
  GitBlame,
  GitBlameLine,
  GitLinguistProgressEvent,
  GitLinguistProgressStage,
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
  GitRepositoryLinguist,
  GitRepositoryLinguistLanguage,
  GitRepositoryLinguistLines,
  GitRepositoryStatus,
  GitRepositorySummary,
  GitSearchFileResult,
  GitSearchMatch,
  GitSearchResult,
  GitStatusEntry,
  GitTagDetail,
  GitTagSummary,
  GitTreeEntry,
  GitTreeEntryIcon,
  GitWorkingTree,
  GitWorkingTreeEntry,
};
