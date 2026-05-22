import { GitHostError } from "../errors.js";
import type {
  FetchOptions,
  GitActor,
  GitRemoteCredentials,
  GitRemoteTransportOptions,
  GitRepositoryHandle,
  PullOptions,
  PushOptions,
} from "../types.js";
import { text } from "../utils/text.js";
import { buildGitEnv, repositoryExists, runGit } from "./run_git.js";

const REMOTE_USERNAME_ENV = "TREBIRED_GIT_HOST_REMOTE_USERNAME";
const REMOTE_PASSWORD_ENV = "TREBIRED_GIT_HOST_REMOTE_PASSWORD";
const REMOTE_CREDENTIAL_HELPER = "!f() { if [ \"$1\" = get ]; then test -n \"$TREBIRED_GIT_HOST_REMOTE_USERNAME\" && echo \"username=$TREBIRED_GIT_HOST_REMOTE_USERNAME\"; test -n \"$TREBIRED_GIT_HOST_REMOTE_PASSWORD\" && echo \"password=$TREBIRED_GIT_HOST_REMOTE_PASSWORD\"; fi; }; f";

function withRemoteUrlOverrideArgs(remoteNameInput: unknown, remoteUrlInput: unknown): string[] {
  const remoteName = text(remoteNameInput, "origin");
  const remoteUrl = text(remoteUrlInput);
  if (!remoteUrl) return [];

  return [
    "-c",
    `remote.${remoteName}.url=${remoteUrl}`,
    "-c",
    `remote.${remoteName}.pushurl=${remoteUrl}`,
  ];
}

function normalizeRemoteCredentialEnv(credentialsInput: GitRemoteCredentials | undefined) {
  const username = text(credentialsInput && credentialsInput.username);
  const password = text(credentialsInput && credentialsInput.password);
  if (!username && !password) return null;

  return {
    [REMOTE_USERNAME_ENV]: username,
    [REMOTE_PASSWORD_ENV]: password,
    GCM_INTERACTIVE: "Never",
    GIT_TERMINAL_PROMPT: "0",
  };
}

function withRemoteCredentialArgs(credentialsInput: GitRemoteCredentials | undefined): string[] {
  const credentialEnv = normalizeRemoteCredentialEnv(credentialsInput);
  if (!credentialEnv) return [];

  return [
    "-c",
    "credential.helper=",
    "-c",
    `credential.helper=${REMOTE_CREDENTIAL_HELPER}`,
  ];
}

function withHttpHeaderArgs(headersInput: Record<string, string> | undefined): string[] {
  const headers = headersInput && typeof headersInput === "object" ? headersInput : {};
  const args: string[] = [];

  for (const [name, value] of Object.entries(headers)) {
    const headerName = text(name);
    const headerValue = text(value);
    if (!headerName) continue;
    if (headerName.includes("\r") || headerName.includes("\n") || headerValue.includes("\r") || headerValue.includes("\n")) {
      throw new GitHostError("git_command_failed", "HTTP headers must not contain newline characters.", {
        header: headerName,
      });
    }
    args.push("-c", `http.extraHeader=${headerName}: ${headerValue}`);
  }

  return args;
}

function buildRemoteGitArgs(
  options: GitRemoteTransportOptions & { remote?: string; remoteUrl?: string },
): string[] {
  return [
    ...withRemoteUrlOverrideArgs(options.remote, options.remoteUrl),
    ...withRemoteCredentialArgs(options.remoteCredentials),
    ...withHttpHeaderArgs(options.httpHeaders),
  ];
}

function buildRemoteGitEnv(
  options: GitRemoteTransportOptions & { actor?: GitActor | null } = {},
): Record<string, string> {
  const credentialEnv = normalizeRemoteCredentialEnv(options.remoteCredentials) || {};
  const sshCommand = text(options.sshCommand);

  return buildGitEnv({
    actor: options.actor || null,
    extraEnv: {
      ...(options.env || {}),
      ...credentialEnv,
      ...(sshCommand ? { GIT_SSH_COMMAND: sshCommand } : {}),
    },
  });
}

async function assertRepositoryReady(repository: GitRepositoryHandle): Promise<void> {
  const hasRepo = await repositoryExists(repository.path);
  if (!hasRepo) {
    throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
      repositoryId: repository.id,
      path: repository.path,
    });
  }
}

async function currentRepositoryBranch(repository: GitRepositoryHandle): Promise<string> {
  const branchRes = await runGit(["symbolic-ref", "--short", "HEAD"], { cwd: repository.path });
  if (branchRes.ok) return text(branchRes.stdout);

  const fallbackRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repository.path });
  return fallbackRes.ok ? text(fallbackRes.stdout) : "";
}

async function fetchRepository(repository: GitRepositoryHandle, options: FetchOptions = {}): Promise<void> {
  await assertRepositoryReady(repository);

  const remoteName = text(options.remote, "origin");
  const fetchRes = await runGit([
    ...buildRemoteGitArgs({
      ...options,
      remote: remoteName,
    }),
    "fetch",
    ...(options.prune === true ? ["--prune"] : []),
    ...(options.tags === true ? ["--tags"] : []),
    remoteName,
  ], {
    cwd: repository.path,
    env: buildRemoteGitEnv(options),
  });
  if (!fetchRes.ok) {
    throw new GitHostError("git_command_failed", text(fetchRes.stderr, "Failed to fetch repository remote."), {
      repositoryId: repository.id,
      remote: remoteName,
    });
  }
}

async function pullRepository(repository: GitRepositoryHandle, options: PullOptions = {}): Promise<void> {
  await assertRepositoryReady(repository);

  const remoteName = text(options.remote, "origin");
  const branchName = text(options.branch) || await currentRepositoryBranch(repository);
  if (!branchName) {
    throw new GitHostError("git_command_failed", "Current repository branch is required.", {
      repositoryId: repository.id,
    });
  }

  const args = [
    ...buildRemoteGitArgs({
      ...options,
      remote: remoteName,
    }),
    "pull",
  ];
  if (options.rebase === true) args.push("--rebase");
  else if (options.ffOnly !== false) args.push("--ff-only");
  args.push(remoteName, branchName);

  const pullRes = await runGit(args, {
    cwd: repository.path,
    env: buildRemoteGitEnv({
      ...options,
      actor: options.actor || null,
    }),
  });
  if (!pullRes.ok) {
    throw new GitHostError("git_command_failed", text(pullRes.stderr, "Failed to pull repository changes."), {
      repositoryId: repository.id,
      remote: remoteName,
      branch: branchName,
    });
  }
}

async function pushRepository(repository: GitRepositoryHandle, options: PushOptions = {}): Promise<void> {
  await assertRepositoryReady(repository);

  const remoteName = text(options.remote, "origin");
  const branchName = text(options.branch) || await currentRepositoryBranch(repository);
  if (!branchName) {
    throw new GitHostError("git_command_failed", "Current repository branch is required.", {
      repositoryId: repository.id,
    });
  }

  const pushRes = await runGit([
    ...buildRemoteGitArgs({
      ...options,
      remote: remoteName,
    }),
    "push",
    ...(options.setUpstream === true ? ["-u"] : []),
    remoteName,
    branchName,
  ], {
    cwd: repository.path,
    env: buildRemoteGitEnv({
      ...options,
      actor: options.actor || null,
    }),
  });
  if (!pushRes.ok) {
    throw new GitHostError("git_command_failed", text(pushRes.stderr, "Failed to push repository changes."), {
      repositoryId: repository.id,
      remote: remoteName,
      branch: branchName,
    });
  }
}

export { buildRemoteGitArgs, buildRemoteGitEnv, fetchRepository, pullRepository, pushRepository };
