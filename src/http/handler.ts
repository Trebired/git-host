import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { resolveLogger } from "#cqgsder5zlmf";
import type {
  CreateGitHttpHandlerOptions,
  GitHttpAuditEvent,
  GitRepositoryHandle,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import {
  applyAuthorizationHeaders,
  authorizationAllowed,
  emitHttpAuditEvent,
  ensureHttpExportPath,
  normalizeAuthenticationResult,
  parseBackendHeaders,
  parseGitHttpRoute,
  requestedGitService,
  resolveRepositoryResult,
} from "./handler/helpers.js";

type HttpRequestState = {
  audit: GitHttpAuditEvent;
  logGroup: string;
  logger: ReturnType<typeof resolveLogger>;
  method: string;
  remoteAddress: string;
  url: URL;
  verbose: boolean;
};

type ResolvedHttpRepository = {
  exportPath: string;
  repository: GitRepositoryHandle;
  repositoryKey: string;
  route: NonNullable<ReturnType<typeof parseGitHttpRoute>>;
  service: ReturnType<typeof requestedGitService>;
  wantsWrite: boolean;
};

type AuthorizedHttpRequest = {
  remoteUser: string;
};

function createHttpRequestState(req: IncomingMessage, options: CreateGitHttpHandlerOptions): HttpRequestState {
  return {
    audit: {
      method: text(req.method).toUpperCase() || "GET",
      outcome: "failed",
      pathname: new URL(String(req.url || "/"), "http://127.0.0.1").pathname,
      remoteAddress: text(req.socket?.remoteAddress),
      remoteUser: "anonymous",
      status: 500,
      wantsWrite: false,
    },
    logGroup: "trebired.git-host.http",
    logger: resolveLogger(options.logger, options.loggerAdapter),
    method: text(req.method).toUpperCase() || "GET",
    remoteAddress: text(req.socket?.remoteAddress),
    url: new URL(String(req.url || "/"), "http://127.0.0.1"),
    verbose: options.verbose === true,
  };
}

function respondHttpFailure(res: ServerResponse, audit: GitHttpAuditEvent, status: number, message: string) {
  res.statusCode = status;
  audit.status = status;
  audit.message = message;
  res.end(message);
}

function finalizeHttpOutcome(status: number, outcome: GitHttpAuditEvent["outcome"]) {
  if (outcome === "failed" && status < 400) return "completed";
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "denied";
  if (status >= 400 && status < 500 && outcome === "failed") return "denied";
  if (status < 400) return "completed";
  return outcome;
}

function registerHttpAudit(
  res: ServerResponse,
  options: CreateGitHttpHandlerOptions,
  state: HttpRequestState,
) {
  let auditSent = false;
  res.on("finish", () => {
    if (auditSent) return;
    auditSent = true;
    const status = Number(res.statusCode) || state.audit.status || 500;
    const outcome = finalizeHttpOutcome(status, state.audit.outcome);
    const finalAudit = { ...state.audit, outcome, status };
    emitHttpAuditEvent(options.onAuditEvent, finalAudit);
    if (options.activity) void Promise.resolve(options.activity.recordHttpAuditEvent(finalAudit)).catch(() => {});
    const metadata = {
      message: state.audit.message,
      method: state.method,
      outcome,
      pathname: state.url.pathname,
      remoteAddress: state.remoteAddress,
      remoteUser: state.audit.remoteUser,
      repositoryKey: state.audit.repositoryKey,
      service: state.audit.service,
      status,
      wantsWrite: state.audit.wantsWrite,
    };
    if (status >= 500) state.logger.error(state.logGroup, "http git request failed", metadata);
    else if (status >= 400) state.logger.warn(state.logGroup, "http git request denied", metadata);
    else if (state.verbose) state.logger.info(state.logGroup, "http git request completed", metadata);
  });
}

async function resolveHttpRepository(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateGitHttpHandlerOptions,
  state: HttpRequestState,
) {
  const route = parseGitHttpRoute(state.url.pathname, options.basePath);
  if (!route) {
    respondHttpFailure(res, state.audit, 404, "Not found.");
    return null;
  }
  state.audit.repositoryKey = route.repositoryKey;
  const resolved = await resolveRepositoryResult(options, route.repositoryKey, req);
  if (!resolved) {
    respondHttpFailure(res, state.audit, 404, "Repository not found.");
    return null;
  }
  const service = requestedGitService(state.url.searchParams, route.suffix);
  const repositoryKey = text(resolved.repositoryKey, route.repositoryKey);
  const wantsWrite = service === "git-receive-pack";
  state.audit.repository = resolved.repository;
  state.audit.repositoryKey = repositoryKey;
  state.audit.service = service;
  state.audit.wantsWrite = wantsWrite;
  return {
    exportPath: ensureHttpExportPath(resolved.repository, resolved.exportName || route.repositoryKey),
    repository: resolved.repository,
    repositoryKey,
    route,
    service,
    wantsWrite,
  } satisfies ResolvedHttpRepository;
}

async function authorizeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateGitHttpHandlerOptions,
  state: HttpRequestState,
  resolved: ResolvedHttpRepository,
) {
  const authn = normalizeAuthenticationResult(options.authenticate
    ? await options.authenticate({
      method: state.method,
      pathname: state.url.pathname,
      remoteAddress: state.remoteAddress,
      repository: resolved.repository,
      repositoryKey: resolved.repositoryKey,
      request: req,
      searchParams: state.url.searchParams,
      service: resolved.service,
      wantsWrite: resolved.wantsWrite,
    })
    : undefined);
  state.audit.identity = authn.identity;
  state.audit.remoteUser = authn.remoteUser;
  const authz = authorizationAllowed(options.authorize
    ? await options.authorize({
      identity: authn.identity,
      method: state.method,
      pathname: state.url.pathname,
      remoteAddress: state.remoteAddress,
      remoteUser: authn.remoteUser,
      repository: resolved.repository,
      repositoryKey: resolved.repositoryKey,
      request: req,
      searchParams: state.url.searchParams,
      service: resolved.service,
      wantsWrite: resolved.wantsWrite,
    })
    : undefined);
  applyAuthorizationHeaders(res, authz.headers);
  if (!authz.allowed) {
    state.audit.remoteUser = authz.remoteUser || authn.remoteUser;
    respondHttpFailure(res, state.audit, authz.status || 403, authz.message || "Permission denied.");
    return null;
  }
  state.audit.remoteUser = authz.remoteUser || authn.remoteUser;
  return { remoteUser: authz.remoteUser || authn.remoteUser } satisfies AuthorizedHttpRequest;
}

function spawnGitHttpBackend(
  req: IncomingMessage,
  state: HttpRequestState,
  resolved: ResolvedHttpRepository,
  authorized: AuthorizedHttpRequest,
) {
  return spawn("git", ["http-backend"], {
    env: {
      ...process.env,
      CONTENT_LENGTH: text(req.headers["content-length"]),
      CONTENT_TYPE: text(req.headers["content-type"]),
      GIT_HTTP_EXPORT_ALL: "1",
      GIT_PROJECT_ROOT: path.dirname(resolved.exportPath),
      PATH_INFO: `/${path.basename(resolved.exportPath)}${resolved.route.suffix}`,
      QUERY_STRING: state.url.searchParams.toString(),
      REMOTE_ADDR: state.remoteAddress,
      REMOTE_USER: authorized.remoteUser,
      REQUEST_METHOD: state.method,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function forwardBackendHeaders(res: ServerResponse, headerBuffer: Buffer) {
  let splitIndex = headerBuffer.indexOf(Buffer.from("\r\n\r\n"));
  let splitSize = 4;
  if (splitIndex < 0) {
    splitIndex = headerBuffer.indexOf(Buffer.from("\n\n"));
    splitSize = 2;
  }
  if (splitIndex < 0) return null;
  const rawHeaders = headerBuffer.slice(0, splitIndex).toString("utf8");
  const bodyChunk = headerBuffer.slice(splitIndex + splitSize);
  const parsed = parseBackendHeaders(rawHeaders);
  res.statusCode = parsed.statusCode;
  for (const [name, value] of parsed.headers) res.setHeader(name, value);
  if (bodyChunk.length) res.write(bodyChunk);
  return Buffer.alloc(0);
}

function proxyGitHttpBackend(
  req: IncomingMessage,
  res: ServerResponse,
  state: HttpRequestState,
  child: ReturnType<typeof spawn>,
) {
  let stderr = "";
  let headerBuffer = Buffer.alloc(0);
  let headersSent = false;
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.stdout.on("data", (chunk: Buffer) => {
    if (headersSent) {
      res.write(chunk);
      return;
    }
    headerBuffer = Buffer.concat([headerBuffer, chunk]);
    const remaining = forwardBackendHeaders(res, headerBuffer);
    if (!remaining) return;
    headersSent = true;
    headerBuffer = remaining;
  });
  child.on("close", (code) => {
    if (!headersSent) return respondHttpFailure(res, state.audit, 502, text(stderr, `git-http-backend exited with code ${Number(code) || 0}`));
    state.audit.status = res.statusCode || 200;
    res.end();
  });
  child.on("error", (error: any) => {
    const message = error?.message ? String(error.message) : "Failed to start git-http-backend.";
    if (!headersSent) return respondHttpFailure(res, state.audit, 502, message);
    state.audit.status = res.statusCode || 502;
    state.audit.message = message;
    res.end();
  });
  req.pipe(child.stdin);
}

async function handleGitHttpRequest(req: IncomingMessage, res: ServerResponse, options: CreateGitHttpHandlerOptions) {
  const state = createHttpRequestState(req, options);
  registerHttpAudit(res, options, state);
  const resolved = await resolveHttpRepository(req, res, options, state);
  if (!resolved) return;
  const authorized = await authorizeHttpRequest(req, res, options, state, resolved);
  if (!authorized) return;
  proxyGitHttpBackend(req, res, state, spawnGitHttpBackend(req, state, resolved, authorized));
}

function createGitHttpHandler(options: CreateGitHttpHandlerOptions) {
  if (!options || typeof options.resolveRepository !== "function") {
    throw new TypeError("createGitHttpHandler() requires a resolveRepository() function.");
  }
  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "trebired.git-host.http",
    logger: options.logger,
    source: "@trebired/git-host",
  });
  return function gitHttpHandler(req: IncomingMessage, res: ServerResponse) {
    void handleGitHttpRequest(req, res, options).catch((error) => {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : "Git HTTP handler failed.");
    });
  };
}

export { createGitHttpHandler, parseGitHttpRoute };
