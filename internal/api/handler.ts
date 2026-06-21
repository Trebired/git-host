import type { IncomingMessage, ServerResponse } from "node:http";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitApiHandlerOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { enrichRepositoryDataWithArchives, isArchiveDownloadAction, writeArchiveDownload } from "./handler/archive.js";
import { runGitApiAction } from "./handler/action.js";
import {
  applyAuthorizationHeaders,
  authorizationAllowed,
  serializeError,
  statusForError,
  writeJson,
} from "./handler/response.js";
import { parseGitApiRoute } from "./handler/route.js";

async function handleGitApiRequest(req: IncomingMessage, res: ServerResponse, options: CreateGitApiHandlerOptions) {
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const verbose = options.verbose === true;
  const logGroup = "git-host.api";
  const method = text(req.method).toUpperCase() || "GET";

  if (method !== "GET" && method !== "HEAD") {
    logger.warn(logGroup, "rejected unsupported api method", { method, pathname: String(req.url || "/") });
    res.setHeader("allow", "GET, HEAD");
    writeJson(req, res, 405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Only GET and HEAD are supported.",
      },
    });
    return;
  }

  const url = new URL(String(req.url || "/"), "http://127.0.0.1");
  const route = parseGitApiRoute(url.pathname, options.basePath);
  if (!route) {
    if (verbose) logger.warn(logGroup, "api route not found", { method, pathname: url.pathname });
    writeJson(req, res, 404, {
      ok: false,
      error: {
        code: "route_not_found",
        message: "Git API route not found.",
      },
    });
    return;
  }

  const repositoryKey = route.repositoryKey;
  const repositoryId = text(options.resolveRepositoryId ? await options.resolveRepositoryId(repositoryKey, req) : repositoryKey);
  if (!repositoryId) {
    logger.warn(logGroup, "api repository not found", { method, pathname: url.pathname, repositoryKey });
    writeJson(req, res, 404, {
      ok: false,
      error: {
        code: "repository_not_found",
        message: "Repository not found.",
      },
    });
    return;
  }

  const auth = authorizationAllowed(options.authorize
    ? await options.authorize({
      action: route.action,
      commitRef: "commitRef" in route ? route.commitRef : undefined,
      method,
      pathname: url.pathname,
      remoteAddress: text(req.socket && req.socket.remoteAddress),
      repositoryId,
      repositoryKey,
      refName: "refName" in route ? route.refName : undefined,
      request: req,
      searchParams: url.searchParams,
    })
    : undefined);

  applyAuthorizationHeaders(res, auth.headers);
  if (!auth.allowed) {
    logger.warn(logGroup, "api permission denied", {
      action: route.action,
      method,
      pathname: url.pathname,
      repositoryId,
      repositoryKey,
      status: auth.status || 403,
    });
    if (isArchiveDownloadAction(route.action)) {
      logger.warn(logGroup, "archive download denied", {
        action: route.action,
        method,
        pathname: url.pathname,
        repositoryId,
        repositoryKey,
        status: auth.status || 403,
      });
    }
    writeJson(req, res, auth.status || 403, {
      ok: false,
      error: {
        code: "permission_denied",
        message: auth.message || "Permission denied.",
      },
    });
    return;
  }

  try {
    if (isArchiveDownloadAction(route.action)) {
      logger.info(logGroup, "archive download authorized", {
        action: route.action,
        method,
        pathname: url.pathname,
        repositoryId,
        repositoryKey,
      });
      await writeArchiveDownload(req, res, options.gitHost, {
        ref: "refName" in route ? route.refName : "HEAD",
        repositoryId,
        repositoryKey,
        routeAction: route.action,
      });
      return;
    }

    const rawData = await runGitApiAction(options, route, repositoryId, url.searchParams);
    const data = await enrichRepositoryDataWithArchives(options, {
      ...route,
      repositoryId,
    } as any, rawData);
    if (verbose) logger.info(logGroup, "api action completed", { action: route.action, method, pathname: url.pathname, repositoryId, repositoryKey });
    writeJson(req, res, 200, {
      ok: true,
      action: route.action,
      data,
      repository_id: repositoryId,
      repository_key: repositoryKey,
    });
  } catch (error) {
    logger.error(logGroup, "api action failed", {
      action: route.action,
      error: error instanceof Error ? error.message : String(error),
      method,
      pathname: url.pathname,
      repositoryId,
      repositoryKey,
    });
    writeJson(req, res, statusForError(error), serializeError(error));
  }
}

function createGitApiHandler(options: CreateGitApiHandlerOptions) {
  if (!options || typeof options.gitHost !== "object") {
    throw new TypeError("createGitApiHandler() requires a gitHost instance.");
  }

  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "git-host.api",
    logger: options.logger,
    source: "@trebired/git-host",
  });

  return function gitApiHandler(req: IncomingMessage, res: ServerResponse) {
    void handleGitApiRequest(req, res, options).catch((error) => {
      writeJson(req, res, 500, serializeError(error));
    });
  };
}

export { createGitApiHandler, parseGitApiRoute };
