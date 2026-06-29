import type { GitActor, GitHostLogger, GitHostLoggerAdapter, MaybePromise } from "../common.js";
import type { GitForgeActivityRecorder } from "../forge.js";
import type {
  GitArchiveFormat,
  GitBlame,
  GitBlob,
  GitBranchSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitDirectorySnapshot,
  GitFileContent,
  GitFileSnapshot,
  GitInspectionEmptyBehavior,
  GitInspectionProgressEvent,
  GitInspectionRef,
  GitInspectionTarget,
  GitLinguistProgressEvent,
  GitRepositoryAnalysis,
  GitRepositoryHandle,
  GitRepositoryLinguist,
  GitRepositorySummary,
  GitSearchResult,
  GitSourceArchiveLinks,
  GitTagDetail,
  GitTagSummary,
  GitTreeEntry,
  GitTreeSnapshot,
  GitWorkingTree,
} from "../repository.js";
import type { GitHostArchiveOptions, OpenArchiveOptions, ReadArchiveOptions, ResolveArchiveLinksInput, ResolveArchiveOptions } from "./archive.js";

type BuildGitEnvOptions = {
  actor?: GitActor | null;
  extraEnv?: Record<string, string>;
};

type GitRemoteCredentials = {
  password?: string;
  username?: string;
};

type GitRemoteTransportOptions = {
  env?: Record<string, string>;
  httpHeaders?: Record<string, string>;
  remoteCredentials?: GitRemoteCredentials;
  sshCommand?: string;
};

type CreateGitHostOptions = {
  activity?: GitForgeActivityRecorder;
  archive?: GitHostArchiveOptions;
  defaultActor?: GitActor;
  logger?: GitHostLogger;
  loggerAdapter?: GitHostLoggerAdapter;
  managedExcludeHeader?: string;
  managedExcludePatterns?: string[];
  resolveRepository: (repositoryId: string) => MaybePromise<GitRepositoryHandle | null>;
  verbose?: boolean;
};

type EnsureRepositoryOptions = GitRemoteTransportOptions & {
  actor?: GitActor;
  cloneUrl?: string;
  commitLimit?: number;
  includeManagedExclude?: boolean;
  initialBranch?: string;
  initialCommitMessage?: string;
  remoteUrl?: string;
};

type ReadSummaryOptions = {
  commitLimit?: number;
};

type ListCommitsOptions = {
  limit?: number;
  path?: string;
  ref?: string;
};

type CreateBranchInput = {
  checkout?: boolean;
  name?: string;
  startPoint?: string;
};

type CheckoutRefInput = {
  detach?: boolean;
  ref?: string;
};

type CheckoutBranchInput = {
  name?: string;
};

type DeleteBranchInput = {
  force?: boolean;
  name?: string;
};

type CreateTagInput = {
  actor?: GitActor;
  message?: string;
  name?: string;
  ref?: string;
};

type DeleteTagInput = {
  name?: string;
};

type StagePathsInput = {
  paths?: string | string[];
};

type UnstagePathsInput = {
  paths?: string | string[];
};

type DiscardPathsInput = {
  paths?: string | string[];
  removeUntracked?: boolean;
};

type CommitInput = {
  actor?: GitActor;
  message?: string;
};

type ContinueOperationInput = {
  actor?: GitActor;
};

type MergeInput = {
  actor?: GitActor;
  ffOnly?: boolean;
  noCommit?: boolean;
  ref?: string;
};

type RebaseInput = {
  actor?: GitActor;
  onto?: string;
  ref?: string;
};

type CherryPickInput = {
  actor?: GitActor;
  mainline?: number;
  noCommit?: boolean;
  refs?: string | string[];
};

type ListTreeOptions = {
  icons?: boolean;
  linguist?: boolean;
  onLinguistProgress?: (event: GitLinguistProgressEvent) => MaybePromise<void>;
  path?: string;
  recursive?: boolean;
  ref?: string;
};

type GitInspectionRefOptions = {
  ifMissingRef?: GitInspectionEmptyBehavior;
  ifUnborn?: GitInspectionEmptyBehavior;
  ref?: GitInspectionRef;
};

type ResolveInspectionTargetOptions = GitInspectionRefOptions;

type ReadTreeOptions = GitInspectionRefOptions & {
  ascii?: boolean;
  icons?: boolean;
  linguist?: boolean;
  nested?: boolean;
  onLinguistProgress?: (event: GitLinguistProgressEvent) => MaybePromise<void>;
  onProgress?: (event: GitInspectionProgressEvent) => MaybePromise<void>;
  path?: string;
  recursive?: boolean;
};

type ReadDirectoryOptions = GitInspectionRefOptions & {
  icons?: boolean;
  includeLineCounts?: boolean;
  linguist?: boolean;
  onLinguistProgress?: (event: GitLinguistProgressEvent) => MaybePromise<void>;
  onProgress?: (event: GitInspectionProgressEvent) => MaybePromise<void>;
  path?: string;
};

type ReadFileOptions = GitInspectionRefOptions & {
  includeIcon?: boolean;
  includeLanguage?: boolean;
  onProgress?: (event: GitInspectionProgressEvent) => MaybePromise<void>;
  path?: string;
};

type ReadRepositoryAnalysisOptions = GitInspectionRefOptions & {
  ascii?: boolean;
  icons?: boolean;
  nested?: boolean;
  onLinguistProgress?: (event: GitLinguistProgressEvent) => MaybePromise<void>;
  onProgress?: (event: GitInspectionProgressEvent) => MaybePromise<void>;
  path?: string;
  recursive?: boolean;
};

type ReadLinguistOptions = {
  onProgress?: (event: GitLinguistProgressEvent) => MaybePromise<void>;
  ref?: string;
};

type ReadBlameOptions = {
  path?: string;
  ref?: string;
};

type SearchRepositoryOptions = {
  caseSensitive?: boolean;
  limit?: number;
  path?: string;
  query?: string;
  ref?: string;
  regexp?: boolean;
};

type ReadBlobOptions = {
  path?: string;
  ref?: string;
};

type ReadWorkingTreeFileOptions = {
  path?: string;
};

type DiffOptions = {
  baseRef?: string;
  headRef?: string;
  path?: string;
};

type FetchOptions = GitRemoteTransportOptions & {
  prune?: boolean;
  remote?: string;
  remoteUrl?: string;
  tags?: boolean;
};

type PullOptions = GitRemoteTransportOptions & {
  actor?: GitActor;
  branch?: string;
  ffOnly?: boolean;
  rebase?: boolean;
  remote?: string;
  remoteUrl?: string;
};

type PushOptions = GitRemoteTransportOptions & {
  actor?: GitActor;
  branch?: string;
  remote?: string;
  remoteUrl?: string;
  setUpstream?: boolean;
};

export type {
  BuildGitEnvOptions,
  CherryPickInput,
  CheckoutBranchInput,
  CheckoutRefInput,
  CommitInput,
  ContinueOperationInput,
  CreateBranchInput,
  CreateGitHostOptions,
  CreateTagInput,
  DeleteBranchInput,
  DeleteTagInput,
  DiffOptions,
  DiscardPathsInput,
  EnsureRepositoryOptions,
  FetchOptions,
  GitInspectionRefOptions,
  GitRemoteCredentials,
  GitRemoteTransportOptions,
  ListCommitsOptions,
  ListTreeOptions,
  MergeInput,
  OpenArchiveOptions,
  PullOptions,
  PushOptions,
  ReadArchiveOptions,
  ReadBlameOptions,
  ReadBlobOptions,
  ReadDirectoryOptions,
  ReadFileOptions,
  ReadLinguistOptions,
  ReadRepositoryAnalysisOptions,
  ReadSummaryOptions,
  ReadTreeOptions,
  ReadWorkingTreeFileOptions,
  RebaseInput,
  ResolveArchiveLinksInput,
  ResolveArchiveOptions,
  ResolveInspectionTargetOptions,
  SearchRepositoryOptions,
  StagePathsInput,
  UnstagePathsInput,
};
