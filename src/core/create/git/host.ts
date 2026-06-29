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

function createGitHost(options: CreateGitHostOptions): GitHost {
  if (!options || typeof options.resolveRepository !== "function") {
    throw new TypeError("createGitHost() requires a resolveRepository() function.");
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const logGroup = "git-host";
  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: logGroup,
    logger: options.logger,
    source: "@trebired/git-host",
  });
  const verbose = options.verbose === true;
  const lockManager = new RepositoryLockManager();
  const archiveService = createGitArchiveService({
    archiveOptions: options.archive,
    logger,
    verbose,
  });
  const managedExcludeHeader = text(options.managedExcludeHeader, DEFAULT_MANAGED_EXCLUDE_HEADER);
  const managedExcludePatterns = normalizeManagedExcludePatterns(options.managedExcludePatterns);

  async function resolveRepository(repositoryId: string): Promise<GitRepositoryHandle> {
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
  }

  async function ensureRepositoryInner(repositoryId: string, ensureOptions: EnsureRepositoryOptions = {}): Promise<GitRepositoryHandle> {
    const repository = await resolveRepository(repositoryId);
    fs.mkdirSync(repository.path, { recursive: true });

    const hasRepository = await repositoryExists(repository.path);
    const cloneUrl = text(ensureOptions.cloneUrl);
    const remoteUrl = text(ensureOptions.remoteUrl);

    if (!hasRepository && (cloneUrl || remoteUrl)) {
      if (verbose) logger.info(logGroup, "cloning repository", { cloneUrl: cloneUrl || remoteUrl, path: repository.path, repositoryId: repository.id });
      if (!isDirectoryEmpty(repository.path)) {
        throw new GitHostError("repository_clone_target_not_empty", "Repository clone target is not empty.", {
          path: repository.path,
          repositoryId: repository.id,
        });
      }

      const cloneRes = await cloneRepository({
        args: buildRemoteGitArgs({
          httpHeaders: ensureOptions.httpHeaders,
          remoteCredentials: ensureOptions.remoteCredentials,
        }),
        cloneUrl: cloneUrl || remoteUrl,
        remoteUrl: remoteUrl || cloneUrl,
        env: buildRemoteGitEnv({
          actor: ensureOptions.actor || options.defaultActor || null,
          env: ensureOptions.env,
          remoteCredentials: ensureOptions.remoteCredentials,
          sshCommand: ensureOptions.sshCommand,
        }),
        workspaceRoot: repository.path,
      });
      if (!cloneRes.ok) {
        logger.error(logGroup, "repository clone failed", { path: repository.path, repositoryId: repository.id, stderr: text(cloneRes.stderr) });
        throw new GitHostError("git_command_failed", text(cloneRes.stderr, "Failed to clone repository."), {
          args: ["clone"],
          repositoryId: repository.id,
        });
      }
    } else if (!hasRepository) {
      if (verbose) logger.info(logGroup, "initializing repository", { path: repository.path, repositoryId: repository.id });
      const initRes = await initRepository(repository.path, text(ensureOptions.initialBranch, DEFAULT_BRANCH));
      if (!initRes.ok) {
        logger.error(logGroup, "repository initialization failed", { path: repository.path, repositoryId: repository.id, stderr: text(initRes.stderr) });
        throw new GitHostError("git_command_failed", text(initRes.stderr, "Failed to initialize repository."), {
          args: ["init"],
          repositoryId: repository.id,
        });
      }

      if (workspaceHasTrackableFiles(repository.path)) {
        const commitRes = await createInitialCommit(
          repository.path,
          ensureOptions.actor || options.defaultActor || null,
          text(ensureOptions.initialCommitMessage, DEFAULT_COMMIT_MESSAGE),
        );
        if (!commitRes.ok) {
          logger.error(logGroup, "initial repository commit failed", { path: repository.path, repositoryId: repository.id, stderr: text(commitRes.stderr) });
          throw new GitHostError("git_command_failed", text(commitRes.stderr, "Failed to create the initial repository commit."), {
            args: ["commit"],
            repositoryId: repository.id,
          });
        }
      }
    }

    const hostedConfigRes = await ensureHostedRepositoryConfig(repository.path);
    if (!hostedConfigRes.ok) {
      logger.error(logGroup, "hosted repository configuration failed", { path: repository.path, repositoryId: repository.id, stderr: text(hostedConfigRes.stderr) });
      throw new GitHostError("git_command_failed", text(hostedConfigRes.stderr, "Failed to configure the repository for hosted Git access."), {
        repositoryId: repository.id,
      });
    }

    if (ensureOptions.includeManagedExclude !== false) {
      await ensureManagedExcludeFile(repository.path, {
        header: managedExcludeHeader,
        patterns: managedExcludePatterns,
      });
    }

    return repository;
  }

  async function readSummaryInner(repositoryId: string, summaryOptions: ReadSummaryOptions = {}): Promise<GitRepositorySummary> {
    const repository = await resolveRepository(repositoryId);
    const hasRepository = await repositoryExists(repository.path);
    if (!hasRepository) {
      throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
        path: repository.path,
        repositoryId: repository.id,
      });
    }

    try {
      return await buildRepositorySummary(repository, { commitLimit: summaryOptions.commitLimit });
    } catch (error) {
      throw toGitHostError(error, "git_command_failed", "Failed to read repository summary.");
    }
  }

  async function readSummaryForRepository(repository: GitRepositoryHandle, commitLimit?: number): Promise<GitRepositorySummary> {
    try {
      return await buildRepositorySummary(repository, { commitLimit });
    } catch (error) {
      throw toGitHostError(error, "git_command_failed", "Failed to read repository summary.");
    }
  }

  const methodContext = {
    archiveService,
    ensureRepositoryInner,
    lockManager,
    logGroup,
    logger,
    options,
    readSummaryForRepository,
    resolveRepository,
    verbose,
  };

  return {
    async ensureRepository(repositoryId: string, ensureOptions: EnsureRepositoryOptions = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId, ensureOptions);
        return await readSummaryForRepository(repository, ensureOptions.commitLimit);
      });
    },

    async readSummary(repositoryId: string, summaryOptions: ReadSummaryOptions = {}) {
      return await readSummaryInner(repositoryId, summaryOptions);
    },

    async withRepositoryLock<T>(repositoryId: string, operation: () => Promise<T>) {
      return await lockManager.withLock(text(repositoryId), operation);
    },

    ...createBranchMethods(methodContext),
    ...createWorkingTreeMethods(methodContext),
    ...createRemoteMethods(methodContext),
    ...createContentMethods(methodContext),
  };
}

export { createGitHost };
