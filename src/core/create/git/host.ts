import fs from "node:fs";
import { logPackageInitialized } from "@trebired/logger-adapter";

import {
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
  DEFAULT_MANAGED_EXCLUDE_HEADER,
} from "#0bba403f3e43";
import { GitHostError } from "#8974ac53d713";
import { resolveLogger } from "#5a29135e56c1";
import type {
  CreateGitHostOptions,
  EnsureRepositoryOptions,
  GitHost,
  GitRepositoryHandle,
  GitRepositorySummary,
  ReadSummaryOptions,
} from "#3c8d8166992a";
import { assertAbsoluteRepositoryPath } from "#390741ebf5ab";
import { text } from "#62f869522d1f";
import { RepositoryLockManager } from "#90040fe3e934";
import { createGitArchiveService } from "#07a96afa0a48";
import { buildRemoteGitArgs, buildRemoteGitEnv } from "#1a2e563ea829";
import { buildRepositorySummary } from "#4bb83a619bd3";
import {
  cloneRepository,
  createInitialCommit,
  ensureHostedRepositoryConfig,
  ensureManagedExcludeFile,
  initRepository,
  isDirectoryEmpty,
  repositoryExists,
  workspaceHasTrackableFiles,
} from "#96b00569f1f4";
import { createBranchMethods } from "#f88802286a5d";
import { createContentMethods } from "#4159667f1e87";
import { createRemoteMethods } from "#a9f1d698c0aa";
import { createWorkingTreeMethods } from "#de031fc6c08f";
import { normalizeManagedExcludePatterns, toGitHostError } from "#b3a8e61c79e9";

type GitHostRuntime = {
  archiveService: ReturnType<typeof createGitArchiveService>;
  lockManager: RepositoryLockManager;
  logGroup: string;
  logger: ReturnType<typeof resolveLogger>;
  managedExcludeHeader: string;
  managedExcludePatterns: ReturnType<typeof normalizeManagedExcludePatterns>;
  options: CreateGitHostOptions;
  verbose: boolean;
};

function validateCreateGitHostOptions(options: CreateGitHostOptions) {
  if (!options || typeof options.resolveRepository !== "function") {
    throw new TypeError("createGitHost() requires a resolveRepository() function.");
  }
}

function createGitHostRuntime(options: CreateGitHostOptions): GitHostRuntime {
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "git-host",
    logger: options.logger,
    source: "@trebired/git-host",
  });
  return {
    archiveService: createGitArchiveService({
      archiveOptions: options.archive,
      logger,
      verbose: options.verbose === true,
    }),
    lockManager: new RepositoryLockManager(),
    logGroup: "git-host",
    logger,
    managedExcludeHeader: text(options.managedExcludeHeader, DEFAULT_MANAGED_EXCLUDE_HEADER),
    managedExcludePatterns: normalizeManagedExcludePatterns(options.managedExcludePatterns),
    options,
    verbose: options.verbose === true,
  };
}

function createResolveRepository(options: CreateGitHostOptions) {
  return async (repositoryId: string): Promise<GitRepositoryHandle> => {
    const resolved = await options.resolveRepository(text(repositoryId));
    if (!resolved) {
      throw new GitHostError("repository_not_found", `Repository "${text(repositoryId)}" was not found.`, {
        repositoryId: text(repositoryId),
      });
    }
    return {
      id: text(resolved.id, text(repositoryId)),
      path: assertAbsoluteRepositoryPath(resolved.path),
    };
  };
}

function createRepositorySummaryReader() {
  return async (repository: GitRepositoryHandle, commitLimit?: number): Promise<GitRepositorySummary> => {
    try {
      return await buildRepositorySummary(repository, { commitLimit });
    } catch (error) {
      throw toGitHostError(error, "git_command_failed", "Failed to read repository summary.");
    }
  };
}

async function cloneIntoRepository(runtime: GitHostRuntime, repository: GitRepositoryHandle, ensureOptions: EnsureRepositoryOptions) {
  const cloneUrl = text(ensureOptions.cloneUrl);
  const remoteUrl = text(ensureOptions.remoteUrl);
  if (!cloneUrl && !remoteUrl) return false;
  if (runtime.verbose) runtime.logger.info(runtime.logGroup, "cloning repository", { cloneUrl: cloneUrl || remoteUrl, path: repository.path, repositoryId: repository.id });
  if (!isDirectoryEmpty(repository.path)) {
    throw new GitHostError("repository_clone_target_not_empty", "Repository clone target is not empty.", {
      path: repository.path,
      repositoryId: repository.id,
    });
  }
  const cloneRes = await cloneRepository({
    args: buildRemoteGitArgs({ httpHeaders: ensureOptions.httpHeaders, remoteCredentials: ensureOptions.remoteCredentials }),
    cloneUrl: cloneUrl || remoteUrl,
    remoteUrl: remoteUrl || cloneUrl,
    env: buildRemoteGitEnv({
      actor: ensureOptions.actor || runtime.options.defaultActor || null,
      env: ensureOptions.env,
      remoteCredentials: ensureOptions.remoteCredentials,
      sshCommand: ensureOptions.sshCommand,
    }),
    workspaceRoot: repository.path,
  });
  if (!cloneRes.ok) {
    runtime.logger.error(runtime.logGroup, "repository clone failed", { path: repository.path, repositoryId: repository.id, stderr: text(cloneRes.stderr) });
    throw new GitHostError("git_command_failed", text(cloneRes.stderr, "Failed to clone repository."), {
      args: ["clone"],
      repositoryId: repository.id,
    });
  }
  return true;
}

async function initializeRepository(runtime: GitHostRuntime, repository: GitRepositoryHandle, ensureOptions: EnsureRepositoryOptions) {
  if (runtime.verbose) runtime.logger.info(runtime.logGroup, "initializing repository", { path: repository.path, repositoryId: repository.id });
  const initRes = await initRepository(repository.path, text(ensureOptions.initialBranch, DEFAULT_BRANCH));
  if (!initRes.ok) {
    runtime.logger.error(runtime.logGroup, "repository initialization failed", { path: repository.path, repositoryId: repository.id, stderr: text(initRes.stderr) });
    throw new GitHostError("git_command_failed", text(initRes.stderr, "Failed to initialize repository."), {
      args: ["init"],
      repositoryId: repository.id,
    });
  }
  if (!workspaceHasTrackableFiles(repository.path)) return;
  const commitRes = await createInitialCommit(
    repository.path,
    ensureOptions.actor || runtime.options.defaultActor || null,
    text(ensureOptions.initialCommitMessage, DEFAULT_COMMIT_MESSAGE),
  );
  if (!commitRes.ok) {
    runtime.logger.error(runtime.logGroup, "initial repository commit failed", { path: repository.path, repositoryId: repository.id, stderr: text(commitRes.stderr) });
    throw new GitHostError("git_command_failed", text(commitRes.stderr, "Failed to create the initial repository commit."), {
      args: ["commit"],
      repositoryId: repository.id,
    });
  }
}

async function ensureHostedRepository(runtime: GitHostRuntime, repository: GitRepositoryHandle, ensureOptions: EnsureRepositoryOptions) {
  const hostedConfigRes = await ensureHostedRepositoryConfig(repository.path);
  if (!hostedConfigRes.ok) {
    runtime.logger.error(runtime.logGroup, "hosted repository configuration failed", { path: repository.path, repositoryId: repository.id, stderr: text(hostedConfigRes.stderr) });
    throw new GitHostError("git_command_failed", text(hostedConfigRes.stderr, "Failed to configure the repository for hosted Git access."), {
      repositoryId: repository.id,
    });
  }
  if (ensureOptions.includeManagedExclude === false) return;
  await ensureManagedExcludeFile(repository.path, {
    header: runtime.managedExcludeHeader,
    patterns: runtime.managedExcludePatterns,
  });
}

function createEnsureRepositoryInner(
  runtime: GitHostRuntime,
  resolveRepository: (repositoryId: string) => Promise<GitRepositoryHandle>,
) {
  return async (repositoryId: string, ensureOptions: EnsureRepositoryOptions = {}) => {
    const repository = await resolveRepository(repositoryId);
    fs.mkdirSync(repository.path, { recursive: true });
    if (!(await repositoryExists(repository.path)) && !(await cloneIntoRepository(runtime, repository, ensureOptions))) {
      await initializeRepository(runtime, repository, ensureOptions);
    }
    await ensureHostedRepository(runtime, repository, ensureOptions);
    return repository;
  };
}

function createReadSummaryInner(
  resolveRepository: (repositoryId: string) => Promise<GitRepositoryHandle>,
  readSummaryForRepository: (repository: GitRepositoryHandle, commitLimit?: number) => Promise<GitRepositorySummary>,
) {
  return async (repositoryId: string, summaryOptions: ReadSummaryOptions = {}) => {
    const repository = await resolveRepository(repositoryId);
    if (!(await repositoryExists(repository.path))) {
      throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
        path: repository.path,
        repositoryId: repository.id,
      });
    }
    return await readSummaryForRepository(repository, summaryOptions.commitLimit);
  };
}

function createMethodContext(runtime: GitHostRuntime, resolveRepository: (repositoryId: string) => Promise<GitRepositoryHandle>) {
  const readSummaryForRepository = createRepositorySummaryReader();
  const ensureRepositoryInner = createEnsureRepositoryInner(runtime, resolveRepository);
  return {
    ensureRepositoryInner,
    methodContext: {
      archiveService: runtime.archiveService,
      ensureRepositoryInner,
      lockManager: runtime.lockManager,
      logGroup: runtime.logGroup,
      logger: runtime.logger,
      options: runtime.options,
      readSummaryForRepository,
      resolveRepository,
      verbose: runtime.verbose,
    },
    readSummaryForRepository,
  };
}

function createGitHost(options: CreateGitHostOptions): GitHost {
  validateCreateGitHostOptions(options);
  const runtime = createGitHostRuntime(options);
  const resolveRepository = createResolveRepository(options);
  const { ensureRepositoryInner, methodContext, readSummaryForRepository } = createMethodContext(runtime, resolveRepository);
  const readSummaryInner = createReadSummaryInner(resolveRepository, readSummaryForRepository);
  return {
    async ensureRepository(repositoryId: string, ensureOptions: EnsureRepositoryOptions = {}) {
      return await runtime.lockManager.withLock(text(repositoryId), async () => await readSummaryForRepository(
        await ensureRepositoryInner(repositoryId, ensureOptions),
        ensureOptions.commitLimit,
      ));
    },
    async readSummary(repositoryId: string, summaryOptions: ReadSummaryOptions = {}) {
      return await readSummaryInner(repositoryId, summaryOptions);
    },
    async withRepositoryLock<T>(repositoryId: string, operation: () => Promise<T>) {
      return await runtime.lockManager.withLock(text(repositoryId), operation);
    },
    ...createBranchMethods(methodContext),
    ...createWorkingTreeMethods(methodContext),
    ...createRemoteMethods(methodContext),
    ...createContentMethods(methodContext),
  };
}

export { createGitHost };
