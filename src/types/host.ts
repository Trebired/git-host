import type { GitActor, GitHostLogger, GitHostLoggerAdapter, MaybePromise } from "./common.js";
import type {
  GitArchive,
  GitArchiveFormat,
  GitBlame,
  GitDirectorySnapshot,
  GitBlob,
  GitBranchSummary,
  GitFileSnapshot,
  GitInspectionEmptyBehavior,
  GitInspectionProgressEvent,
  GitInspectionRef,
  GitInspectionTarget,
  GitLinguistProgressEvent,
  GitTagDetail,
  GitTagSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitRepositoryAnalysis,
  GitFileContent,
  GitRepositoryHandle,
  GitRepositoryLinguist,
  GitRepositorySummary,
  GitSearchResult,
  GitTreeEntry,
  GitTreeSnapshot,
  GitWorkingTree,
} from "./repository.js";

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

type ReadArchiveOptions = {
  format?: GitArchiveFormat;
  prefix?: string;
  ref?: string;
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

type GitHost = {
  abortOperation(repositoryId: string): Promise<GitRepositorySummary>;
  cherryPick(repositoryId: string, input: CherryPickInput): Promise<GitRepositorySummary>;
  checkoutBranch(repositoryId: string, input: CheckoutBranchInput): Promise<GitRepositorySummary>;
  checkoutRef(repositoryId: string, input: CheckoutRefInput): Promise<GitRepositorySummary>;
  commit(repositoryId: string, input: CommitInput): Promise<GitRepositorySummary>;
  continueOperation(repositoryId: string, input?: ContinueOperationInput): Promise<GitRepositorySummary>;
  createBranch(repositoryId: string, input: CreateBranchInput): Promise<GitRepositorySummary>;
  createTag(repositoryId: string, input: CreateTagInput): Promise<GitTagDetail>;
  deleteBranch(repositoryId: string, input: DeleteBranchInput): Promise<GitRepositorySummary>;
  deleteTag(repositoryId: string, input: DeleteTagInput): Promise<void>;
  discardPaths(repositoryId: string, input?: DiscardPathsInput): Promise<GitRepositorySummary>;
  diff(repositoryId: string, options: DiffOptions): Promise<GitCompareSummary>;
  ensureRepository(repositoryId: string, options?: EnsureRepositoryOptions): Promise<GitRepositorySummary>;
  fetch(repositoryId: string, options?: FetchOptions): Promise<GitRepositorySummary>;
  listBranches(repositoryId: string): Promise<GitBranchSummary[]>;
  listCommits(repositoryId: string, options?: ListCommitsOptions): Promise<GitCommitSummary[]>;
  listTags(repositoryId: string): Promise<GitTagSummary[]>;
  listTree(repositoryId: string, options?: ListTreeOptions): Promise<GitTreeEntry[]>;
  merge(repositoryId: string, input: MergeInput): Promise<GitRepositorySummary>;
  pull(repositoryId: string, options?: PullOptions): Promise<GitRepositorySummary>;
  push(repositoryId: string, options?: PushOptions): Promise<GitRepositorySummary>;
  readArchive(repositoryId: string, options?: ReadArchiveOptions): Promise<GitArchive>;
  readBlame(repositoryId: string, options: ReadBlameOptions): Promise<GitBlame>;
  readBlob(repositoryId: string, options: ReadBlobOptions): Promise<GitBlob>;
  readCommit(repositoryId: string, commitRef: string): Promise<GitCommitDetail>;
  readDirectory(repositoryId: string, options?: ReadDirectoryOptions): Promise<GitDirectorySnapshot>;
  readFile(repositoryId: string, options: ReadFileOptions): Promise<GitFileSnapshot>;
  readRepositoryAnalysis(repositoryId: string, options?: ReadRepositoryAnalysisOptions): Promise<GitRepositoryAnalysis>;
  readLinguist(repositoryId: string, options?: ReadLinguistOptions): Promise<GitRepositoryLinguist>;
  readTag(repositoryId: string, tagName: string): Promise<GitTagDetail>;
  readTree(repositoryId: string, options?: ReadTreeOptions): Promise<GitTreeSnapshot>;
  readStagedFile(repositoryId: string, options: ReadWorkingTreeFileOptions): Promise<GitFileContent>;
  readSummary(repositoryId: string, options?: ReadSummaryOptions): Promise<GitRepositorySummary>;
  readUnstagedFile(repositoryId: string, options: ReadWorkingTreeFileOptions): Promise<GitFileContent>;
  readWorkingTree(repositoryId: string): Promise<GitWorkingTree>;
  rebase(repositoryId: string, input: RebaseInput): Promise<GitRepositorySummary>;
  resolveInspectionTarget(repositoryId: string, options?: ResolveInspectionTargetOptions): Promise<GitInspectionTarget>;
  search(repositoryId: string, options: SearchRepositoryOptions): Promise<GitSearchResult>;
  stagePaths(repositoryId: string, input?: StagePathsInput): Promise<GitRepositorySummary>;
  unstagePaths(repositoryId: string, input?: UnstagePathsInput): Promise<GitRepositorySummary>;
  withRepositoryLock<T>(repositoryId: string, operation: () => Promise<T>): Promise<T>;
};

type ResolveRepositoryPathOptions = {
  repositoryPath: string;
  rootDir: string;
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
  GitHost,
  GitInspectionRefOptions,
  GitRemoteCredentials,
  GitRemoteTransportOptions,
  ListCommitsOptions,
  ListTreeOptions,
  MergeInput,
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
  ResolveInspectionTargetOptions,
  ResolveRepositoryPathOptions,
  SearchRepositoryOptions,
  StagePathsInput,
  UnstagePathsInput,
};
