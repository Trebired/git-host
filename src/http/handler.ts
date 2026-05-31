import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { resolveLogger } from "../logging.js";
import type { CreateGitHttpHandlerOptions, GitHttpAuditEvent } from "../types.js";
import { text } from "../utils/text.js";
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

async function handleGitHttpRequest(req: IncomingMessage, res: ServerResponse, options: CreateGitHttpHandlerOptions) {
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const verbose = options.verbose === true;
  const logGroup = "git-host.http";
  const url = new URL(String(req.url || "/"), "http://127.0.0.1");
  const method = text(req.method).toUpperCase() || "GET";
  const remoteAddress = text(req.socket && req.socket.remoteAddress);
  const audit: GitHttpAuditEvent = {
    method,
    outcome: "failed",
    pathname: url.pathname,
    remoteAddress,
    remoteUser: "anonymous",
    status: 500,
    wantsWrite: false,
  };
  let auditSent = false;

  res.on("finish", () => {
    if (auditSent) return;
    auditSent = true;

    const status = Number(res.statusCode) || audit.status || 500;
    let outcome = audit.outcome;
    if (outcome === "failed" && status < 400) outcome = "completed";
    if (status === 404) outcome = "not_found";
    else if (status === 401 || status === 403) outcome = "denied";
    else if (status >= 400 && status < 500 && outcome === "failed") outcome = "denied";
    else if (status < 400) outcome = "completed";

    emitHttpAuditEvent(options.onAuditEvent, { ...audit, outcome, status });
    const metadata = {
      message: audit.message,
      method,
      outcome,
      pathname: url.pathname,
      remoteAddress,
      remoteUser: audit.remoteUser,
      repositoryKey: audit.repositoryKey,
      service: audit.service,
      status,
      wantsWrite: audit.wantsWrite,
    };

    if (status >= 500) logger.error(logGroup, "http git request failed", metadata);
    else if (status >= 400) logger.warn(logGroup, "http git request denied", metadata);
    else if (verbose) logger.info(logGroup, "http git request completed", metadata);
  });

  const route = parseGitHttpRoute(url.pathname, options.basePath);
  if (!route) {
    res.statusCode = 404;
    audit.status = 404;
    audit.message = "Not found.";
    res.end("Not found.");
    return;
  }

  audit.repositoryKey = route.repositoryKey;
  const resolved = await resolveRepositoryResult(options, route.repositoryKey, req);
  if (!resolved) {
    res.statusCode = 404;
    audit.status = 404;
    audit.message = "Repository not found.";
    res.end("Repository not found.");
    return;
  }

  const repository = resolved.repository;
  const exportPath = ensureHttpExportPath(repository, resolved.exportName || route.repositoryKey);
  const service = requestedGitService(url.searchParams, route.suffix);
  const wantsWrite = service === "git-receive-pack";
  const repositoryKey = text(resolved.repositoryKey, route.repositoryKey);

  audit.repository = repository;
  audit.repositoryKey = repositoryKey;
  audit.service = service;
  audit.wantsWrite = wantsWrite;

  const authn = normalizeAuthenticationResult(options.authenticate
    ? await options.authenticate({
      method,
      pathname: url.pathname,
      remoteAddress,
      repository,
      repositoryKey,
      request: req,
      searchParams: url.searchParams,
      service,
      wantsWrite,
    })
    : undefined);

  audit.identity = authn.identity;
  audit.remoteUser = authn.remoteUser;
  const authResult = authorizationAllowed(options.authorize
    ? await options.authorize({
      identity: authn.identity,
      method,
      pathname: url.pathname,
      remoteAddress,
      remoteUser: authn.remoteUser,
      repository,
      repositoryKey,
      request: req,
      searchParams: url.searchParams,
      service,
      wantsWrite,
    })
    : undefined);

  applyAuthorizationHeaders(res, authResult.headers);
  if (!authResult.allowed) {
    res.statusCode = authResult.status || 403;
    audit.message = authResult.message || "Permission denied.";
    audit.remoteUser = authResult.remoteUser || authn.remoteUser;
    audit.status = res.statusCode;
    res.end(authResult.message || "Permission denied.");
    return;
  }

  audit.remoteUser = authResult.remoteUser || authn.remoteUser;
  const child = spawn("git", ["http-backend"], {
    env: {
      ...process.env,
      CONTENT_LENGTH: text(req.headers["content-length"]),
      CONTENT_TYPE: text(req.headers["content-type"]),
      GIT_HTTP_EXPORT_ALL: "1",
      GIT_PROJECT_ROOT: path.dirname(exportPath),
      PATH_INFO: `/${path.basename(exportPath)}${route.suffix}`,
      QUERY_STRING: url.searchParams.toString(),
      REMOTE_ADDR: remoteAddress,
      REMOTE_USER: authResult.remoteUser || authn.remoteUser,
      REQUEST_METHOD: method,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  let headerBuffer = Buffer.alloc(0);
  let headersSent = false;

  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  child.stdout.on("data", (chunk: Buffer) => {
    if (headersSent) {
      res.write(chunk);
      return;
    }

    headerBuffer = Buffer.concat([headerBuffer, chunk]);
    let splitIndex = headerBuffer.indexOf(Buffer.from("\r\n\r\n"));
    let splitSize = 4;
    if (splitIndex < 0) {
      splitIndex = headerBuffer.indexOf(Buffer.from("\n\n"));
      splitSize = 2;
    }
    if (splitIndex < 0) return;

    const rawHeaders = headerBuffer.slice(0, splitIndex).toString("utf8");
    const bodyChunk = headerBuffer.slice(splitIndex + splitSize);
    const parsed = parseBackendHeaders(rawHeaders);
    res.statusCode = parsed.statusCode;
    for (const [name, value] of parsed.headers) res.setHeader(name, value);
    headersSent = true;
    if (bodyChunk.length) res.write(bodyChunk);
  });

  child.on("close", (code) => {
    if (!headersSent) {
      res.statusCode = 502;
      audit.status = 502;
      audit.message = text(stderr, `git-http-backend exited with code ${Number(code) || 0}`);
      res.end(text(stderr, `git-http-backend exited with code ${Number(code) || 0}`));
      return;
    }
    audit.status = res.statusCode || 200;
    res.end();
  });

  child.on("error", (error: any) => {
    const message = error && error.message ? String(error.message) : "Failed to start git-http-backend.";
    if (!headersSent) {
      res.statusCode = 502;
      audit.status = 502;
      audit.message = message;
      res.end(message);
      return;
    }
    audit.status = res.statusCode || 502;
    audit.message = message;
    res.end();
  });

  req.pipe(child.stdin);
}

function createGitHttpHandler(options: CreateGitHttpHandlerOptions) {
  if (!options || typeof options.resolveRepository !== "function") {
    throw new TypeError("createGitHttpHandler() requires a resolveRepository() function.");
  }

  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "git-host.http",
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
