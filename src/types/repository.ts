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
  source_archives?: GitSourceArchiveLinks;
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

type GitArchiveFormat = "tar" | "tar.gz" | "zip";

type GitSourceArchiveFormat = "tar.gz" | "zip";

type GitArchiveCacheStatus = "hit" | "miss";

type GitSourceArchiveLink = {
  format: GitSourceArchiveFormat;
  href: string;
};

type GitSourceArchiveLinks = {
  tar_gz: GitSourceArchiveLink;
  zip: GitSourceArchiveLink;
};

type GitArchiveMetadata = {
  cache_key: string;
  cache_status: GitArchiveCacheStatus;
  content_type: string;
  file_name: string;
  format: GitSourceArchiveFormat;
  ref: string;
  resolved_commit: string;
  root_directory: string;
  size: number | null;
};

type GitArchive = GitArchiveMetadata & {
  content: string;
  encoding: "base64";
};

type GitArchiveDownload = {
  completed: Promise<GitArchiveMetadata>;
  metadata: GitArchiveMetadata;
  redirect_url?: string;
  stream: NodeJS.ReadableStream;
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

type GitInspectionRef = "auto" | string;

type GitInspectionEmptyBehavior = "empty" | "error";

type GitInspectionTargetResolved = {
  commit: string;
  explicit_ref: boolean;
  requested_ref: GitInspectionRef;
  resolved_ref: string;
  state: "resolved";
};

type GitInspectionTargetEmpty = {
  explicit_ref: boolean;
  reason: "missing_ref" | "unborn";
  requested_ref: GitInspectionRef;
  resolved_ref: string | null;
  state: "empty";
};

type GitInspectionTarget = GitInspectionTargetResolved | GitInspectionTargetEmpty;

type GitInspectionProgressPhase =
  | "resolving_ref"
  | "reading_tree"
  | "reading_blob"
  | "running_linguist"
  | "enriching"
  | "completed"
  | "failed";

type GitInspectionProgressEvent = {
  commit?: string;
  emitted_at: string;
  error?: {
    code: string;
    message: string;
  };
  message: string;
  percent: number;
  phase: GitInspectionProgressPhase;
  raw_linguist?: GitLinguistProgressEvent;
  repository_id: string;
  requested_ref: GitInspectionRef;
  resolved_ref?: string | null;
  source?: "analysis" | "blob" | "linguist" | "tree";
};

type GitTreeNode = {
  children?: GitTreeNode[];
  icon?: GitTreeEntryIcon | null;
  kind: "dir" | "file";
  language?: string | null;
  mode: string;
  name: string;
  object: string;
  path: string;
  size: number | null;
};

type GitTreeSnapshot = {
  ascii?: string;
  empty: boolean;
  entries: GitTreeEntry[];
  linguist?: GitRepositoryLinguist | null;
  nested?: GitTreeNode[];
  path: string;
  target: GitInspectionTarget;
};

type GitDirectoryEntry = {
  icon?: GitTreeEntryIcon | null;
  kind: "dir" | "file";
  language?: string | null;
  line_count?: number;
  mode: string;
  name: string;
  object: string;
  path: string;
  size: number | null;
};

type GitDirectorySnapshot =
  | {
      empty: boolean;
      entries: GitDirectoryEntry[];
      kind: "dir";
      parent_path: string | null;
      path: string;
      target: GitInspectionTarget;
    }
  | {
      empty: boolean;
      entry: GitDirectoryEntry;
      kind: "file";
      parent_path: string | null;
      path: string;
      target: GitInspectionTarget;
    };

type GitFileSnapshot = {
  blob: GitBlob | null;
  empty: boolean;
  icon?: GitTreeEntryIcon | null;
  language?: string | null;
  line_count: number | null;
  parent_path: string | null;
  path: string;
  target: GitInspectionTarget;
  text: string | null;
};

type GitRepositoryAnalysis = {
  empty: boolean;
  linguist: GitRepositoryLinguist;
  target: GitInspectionTarget;
  tree: GitTreeSnapshot;
};

export type {
  GitArchiveCacheStatus,
  GitArchiveDownload,
  GitArchive,
  GitArchiveFormat,
  GitArchiveMetadata,
  GitBlame,
  GitBlameLine,
  GitDirectoryEntry,
  GitDirectorySnapshot,
  GitFileSnapshot,
  GitInspectionEmptyBehavior,
  GitInspectionProgressEvent,
  GitInspectionProgressPhase,
  GitInspectionRef,
  GitInspectionTarget,
  GitInspectionTargetEmpty,
  GitInspectionTargetResolved,
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
  GitRepositoryAnalysis,
  GitRepositoryLinguist,
  GitRepositoryLinguistLanguage,
  GitRepositoryLinguistLines,
  GitRepositoryStatus,
  GitRepositorySummary,
  GitSearchFileResult,
  GitSearchMatch,
  GitSearchResult,
  GitSourceArchiveFormat,
  GitSourceArchiveLink,
  GitSourceArchiveLinks,
  GitStatusEntry,
  GitTagDetail,
  GitTagSummary,
  GitTreeNode,
  GitTreeEntry,
  GitTreeSnapshot,
  GitTreeEntryIcon,
  GitWorkingTree,
  GitWorkingTreeEntry,
};
