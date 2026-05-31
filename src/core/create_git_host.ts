import fs from "node:fs";
import { logPackageInitialized } from "@trebired/logger-adapter";

import {
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
  DEFAULT_MANAGED_EXCLUDE_HEADER,
} from "../constants.js";
import { GitHostError } from "../errors.js";
import { resolveLogger } from "../logging.js";
import type { CreateGitHostOptions, EnsureRepositoryOptions, GitHost, GitRepositoryHandle, GitRepositorySummary, ReadSummaryOptions } from "../types.js";
import { assertAbsoluteRepositoryPath } from "../utils/paths.js";
import { text } from "../utils/text.js";
import { RepositoryLockManager } from "./locks.js";
import { buildRemoteGitArgs, buildRemoteGitEnv } from "./remote.js";
import { buildRepositorySummary } from "./repository.js";
import {
  cloneRepository,
  createInitialCommit,
  ensureHostedRepositoryConfig,
  ensureManagedExcludeFile,
  initRepository,
  isDirectoryEmpty,
  repositoryExists,
  workspaceHasTrackableFiles,
} from "./run_git.js";
import { createBranchMethods } from "./create_git_host/branch_methods.js";
import { createContentMethods } from "./create_git_host/content_methods.js";
import { createRemoteMethods } from "./create_git_host/remote_methods.js";
import { createWorkingTreeMethods } from "./create_git_host/working_tree_methods.js";
import { normalizeManagedExcludePatterns, toGitHostError } from "./create_git_host/shared.js";

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
