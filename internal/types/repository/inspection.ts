import type {
  GitBlob,
  GitRepositoryLinguist,
  GitTreeEntry,
  GitTreeEntryIcon,
} from "./core.js";

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
  GitRepositoryAnalysis,
  GitTreeNode,
  GitTreeSnapshot,
};
