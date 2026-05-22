import type { GitActor, GitHostLogger, MaybePromise } from "./common.js";
import type {
  GitBlob,
  GitBranchSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitFileContent,
  GitRepositoryHandle,
  GitRepositorySummary,
  GitTreeEntry,
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

type ListTreeOptions = {
  path?: string;
  recursive?: boolean;
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
  checkoutBranch(repositoryId: string, input: CheckoutBranchInput): Promise<GitRepositorySummary>;
  checkoutRef(repositoryId: string, input: CheckoutRefInput): Promise<GitRepositorySummary>;
  commit(repositoryId: string, input: CommitInput): Promise<GitRepositorySummary>;
  continueOperation(repositoryId: string, input?: ContinueOperationInput): Promise<GitRepositorySummary>;
  createBranch(repositoryId: string, input: CreateBranchInput): Promise<GitRepositorySummary>;
  deleteBranch(repositoryId: string, input: DeleteBranchInput): Promise<GitRepositorySummary>;
  discardPaths(repositoryId: string, input?: DiscardPathsInput): Promise<GitRepositorySummary>;
  diff(repositoryId: string, options: DiffOptions): Promise<GitCompareSummary>;
  ensureRepository(repositoryId: string, options?: EnsureRepositoryOptions): Promise<GitRepositorySummary>;
  fetch(repositoryId: string, options?: FetchOptions): Promise<GitRepositorySummary>;
  listBranches(repositoryId: string): Promise<GitBranchSummary[]>;
  listCommits(repositoryId: string, options?: ListCommitsOptions): Promise<GitCommitSummary[]>;
  listTree(repositoryId: string, options?: ListTreeOptions): Promise<GitTreeEntry[]>;
  pull(repositoryId: string, options?: PullOptions): Promise<GitRepositorySummary>;
  push(repositoryId: string, options?: PushOptions): Promise<GitRepositorySummary>;
  readBlob(repositoryId: string, options: ReadBlobOptions): Promise<GitBlob>;
  readCommit(repositoryId: string, commitRef: string): Promise<GitCommitDetail>;
  readStagedFile(repositoryId: string, options: ReadWorkingTreeFileOptions): Promise<GitFileContent>;
  readSummary(repositoryId: string, options?: ReadSummaryOptions): Promise<GitRepositorySummary>;
  readUnstagedFile(repositoryId: string, options: ReadWorkingTreeFileOptions): Promise<GitFileContent>;
  readWorkingTree(repositoryId: string): Promise<GitWorkingTree>;
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
  CheckoutBranchInput,
  CheckoutRefInput,
  CommitInput,
  ContinueOperationInput,
  CreateBranchInput,
  CreateGitHostOptions,
  DeleteBranchInput,
  DiffOptions,
  DiscardPathsInput,
  EnsureRepositoryOptions,
  FetchOptions,
  GitHost,
  GitRemoteCredentials,
  GitRemoteTransportOptions,
  ListCommitsOptions,
  ListTreeOptions,
  PullOptions,
  PushOptions,
  ReadBlobOptions,
  ReadSummaryOptions,
  ReadWorkingTreeFileOptions,
  ResolveRepositoryPathOptions,
  StagePathsInput,
  UnstagePathsInput,
};
