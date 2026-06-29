import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { ServerOptions as SocketIoServerOptions } from "socket.io";

import type { GitHostLogger, GitHostLoggerAdapter, MaybePromise } from "./common.js";
import type { GitForgeTransportActivityRecorder } from "./forge.js";
import type { GitHost } from "./host.js";
import type { GitRepositoryHandle } from "./repository.js";

type GitApiResource =
  | "action"
  | "action_run"
  | "action_run_events"
  | "action_run_steps"
  | "action_runs"
  | "actions"
  | "activity"
  | "asset"
  | "archive"
  | "blame"
  | "blob"
  | "branches"
  | "commit"
  | "commits"
  | "diff"
  | "fork_sync"
  | "forks"
  | "linguist"
  | "linguist_socket"
  | "overview"
  | "release"
  | "releases"
  | "search"
  | "social"
  | "stars"
  | "summary"
  | "tag"
  | "tarball"
  | "tags"
  | "tree"
  | "watch"
  | "zipball";

type GitApiAuthorizationResult = boolean | {
  allowed: boolean;
  headers?: Record<string, string>;
  message?: string;
  status?: number;
};

type CreateGitApiHandlerOptions = {
  authorize?: (input: {
    action: GitApiResource;
    commitRef?: string;
    method: string;
    pathname: string;
    remoteAddress: string;
    repositoryId: string;
    repositoryKey: string;
    refName?: string;
    request: IncomingMessage;
    searchParams: URLSearchParams;
  }) => MaybePromise<GitApiAuthorizationResult>;
  basePath?: string;
  gitHost: GitHost;
  logger?: GitHostLogger;
  loggerAdapter?: GitHostLoggerAdapter;
  resolveRepositoryId?: (
    repositoryKey: string,
    request: IncomingMessage,
  ) => MaybePromise<string | null>;
  verbose?: boolean;
};

type CreateGitApiSocketServerOptions = CreateGitApiHandlerOptions & {
  httpServer: HttpServer;
  socketOptions?: Partial<SocketIoServerOptions>;
  socketPath?: string;
};

type GitHttpService = "git-receive-pack" | "git-upload-pack";

type GitHttpAuthenticationResult = null | {
  identity?: unknown;
  remoteUser?: string;
};

type GitHttpAuthorizationResult = boolean | {
  allowed: boolean;
  headers?: Record<string, string>;
  message?: string;
  remoteUser?: string;
  status?: number;
};

type GitHttpAuditOutcome = "completed" | "denied" | "failed" | "not_found";

type GitHttpAuditEvent = {
  identity?: unknown;
  message?: string;
  method: string;
  outcome: GitHttpAuditOutcome;
  pathname: string;
  remoteAddress: string;
  remoteUser: string;
  repository?: GitRepositoryHandle;
  repositoryKey?: string;
  service?: GitHttpService;
  status: number;
  wantsWrite: boolean;
};

type GitHttpResolvedRepository = {
  exportName?: string;
  repository: GitRepositoryHandle;
  repositoryKey?: string;
};

type CreateGitHttpHandlerOptions = {
  activity?: GitForgeTransportActivityRecorder;
  authenticate?: (input: {
    method: string;
    pathname: string;
    remoteAddress: string;
    repository: GitRepositoryHandle;
    repositoryKey: string;
    request: IncomingMessage;
    searchParams: URLSearchParams;
    service: GitHttpService;
    wantsWrite: boolean;
  }) => MaybePromise<GitHttpAuthenticationResult>;
  authorize?: (input: {
    identity?: unknown;
    method: string;
    pathname: string;
    remoteAddress: string;
    remoteUser: string;
    repository: GitRepositoryHandle;
    repositoryKey: string;
    request: IncomingMessage;
    searchParams: URLSearchParams;
    service: GitHttpService;
    wantsWrite: boolean;
  }) => MaybePromise<GitHttpAuthorizationResult>;
  basePath?: string;
  logger?: GitHostLogger;
  loggerAdapter?: GitHostLoggerAdapter;
  onAuditEvent?: (event: GitHttpAuditEvent) => MaybePromise<void>;
  resolveRepository: (
    repositoryKey: string,
    request: IncomingMessage,
  ) => MaybePromise<GitHttpResolvedRepository | GitRepositoryHandle | null>;
  verbose?: boolean;
};

type GitSshService = "git-receive-pack" | "git-upload-pack";

type GitSshAuthenticationResult = null | {
  identity?: unknown;
  publicKey: string;
  remoteUser?: string;
};

type GitSshAuthorizationResult = boolean | {
  allowed: boolean;
  message?: string;
  remoteUser?: string;
};

type GitSshResolvedRepository = {
  repository: GitRepositoryHandle;
  repositoryKey?: string;
};

type GitSshAuditOutcome = "auth_rejected" | "command_rejected" | "completed" | "denied" | "failed" | "repository_not_found";

type GitSshAuditEvent = {
  command?: string;
  exitCode?: number;
  identity?: unknown;
  message?: string;
  outcome: GitSshAuditOutcome;
  remoteAddress: string;
  remoteUser?: string;
  repository?: GitRepositoryHandle;
  repositoryKey?: string;
  service?: GitSshService;
  username?: string;
  wantsWrite?: boolean;
};

type CreateGitSshServerOptions = {
  activity?: GitForgeTransportActivityRecorder;
  authenticate: (input: {
    keyType: string;
    publicKey: string;
    publicKeyData: Buffer;
    remoteAddress: string;
    username: string;
  }) => MaybePromise<GitSshAuthenticationResult>;
  authorize?: (input: {
    command: string;
    identity?: unknown;
    remoteAddress: string;
    remoteUser: string;
    repository: GitRepositoryHandle;
    repositoryKey: string;
    service: GitSshService;
    username: string;
    wantsWrite: boolean;
  }) => MaybePromise<GitSshAuthorizationResult>;
  basePath?: string;
  hostKeys: string[];
  logger?: GitHostLogger;
  loggerAdapter?: GitHostLoggerAdapter;
  resolveRepository: (
    repositoryKey: string,
    input: {
      command: string;
      remoteAddress: string;
      service: GitSshService;
      username: string;
      wantsWrite: boolean;
    },
  ) => MaybePromise<GitSshResolvedRepository | GitRepositoryHandle | null>;
  onAuditEvent?: (event: GitSshAuditEvent) => MaybePromise<void>;
  verbose?: boolean;
};

export type {
  CreateGitApiHandlerOptions,
  CreateGitApiSocketServerOptions,
  CreateGitHttpHandlerOptions,
  CreateGitSshServerOptions,
  GitApiAuthorizationResult,
  GitApiResource,
  GitHttpAuthenticationResult,
  GitHttpAuditEvent,
  GitHttpAuditOutcome,
  GitHttpAuthorizationResult,
  GitHttpResolvedRepository,
  GitHttpService,
  GitSshAuthenticationResult,
  GitSshAuditEvent,
  GitSshAuditOutcome,
  GitSshAuthorizationResult,
  GitSshResolvedRepository,
  GitSshService,
};
