import type {
  GitArchive,
  GitArchiveDownload,
  GitArchiveMetadata,
  GitBlame,
  GitBlob,
  GitBranchSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitDirectorySnapshot,
  GitFileContent,
  GitFileSnapshot,
  GitInspectionTarget,
  GitRepositoryAnalysis,
  GitRepositoryLinguist,
  GitRepositorySummary,
  GitSearchResult,
  GitSourceArchiveLinks,
  GitTagDetail,
  GitTagSummary,
  GitTreeEntry,
  GitTreeSnapshot,
  GitWorkingTree,
} from "#666a84ce027e";
import type {
  CherryPickInput,
  CheckoutBranchInput,
  CheckoutRefInput,
  CommitInput,
  ContinueOperationInput,
  CreateBranchInput,
  CreateTagInput,
  DeleteBranchInput,
  DeleteTagInput,
  DiffOptions,
  DiscardPathsInput,
  EnsureRepositoryOptions,
  FetchOptions,
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
} from "./options.js";

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
  openArchive(repositoryId: string, options?: OpenArchiveOptions): Promise<GitArchiveDownload>;
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
  resolveArchive(repositoryId: string, options?: ResolveArchiveOptions): Promise<GitArchiveMetadata>;
  resolveArchiveLinks(repositoryKey: string, input?: ResolveArchiveLinksInput): GitSourceArchiveLinks;
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
  GitHost,
  ResolveRepositoryPathOptions,
};
