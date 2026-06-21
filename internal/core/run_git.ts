import {
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
} from "#r89qhx6c8mkf";
import { buildGitEnv } from "./run_git/env.js";
import { runGit, runGitBuffer } from "./run_git/process.js";
import {
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
