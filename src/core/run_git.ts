import {
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
} from "#0bba403f3e43";
import { buildGitEnv } from "./run_git/env.js";
import { runGit, runGitBuffer } from "./run_git/process.js";
import {
  assertRepositoryReady,
  cloneRepository,
  createInitialCommit,
  ensureHostedRepositoryConfig,
  ensureManagedExcludeFile,
  initRepository,
  isDirectoryEmpty,
  repositoryExists,
  workspaceHasTrackableFiles,
} from "./run_git/repository_setup.js";

export {
  assertRepositoryReady,
  buildGitEnv,
  cloneRepository,
  createInitialCommit,
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
  ensureHostedRepositoryConfig,
  ensureManagedExcludeFile,
  initRepository,
  isDirectoryEmpty,
  repositoryExists,
  runGit,
  runGitBuffer,
  workspaceHasTrackableFiles,
};
