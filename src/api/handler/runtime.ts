import type { IncomingMessage, ServerResponse } from "node:http";

import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitApiHandlerOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { enrichRepositoryDataWithArchives, isArchiveDownloadAction, writeArchiveDownload } from "./archive.js";
import { runGitApiAction } from "./action.js";
import {
  applyAuthorizationHeaders,
  authorizationAllowed,
  serializeError,
  statusForError,
  writeJson,
} from "./response.js";
import { parseGitApiRoute } from "./route.js";

async function handleGitApiRequest(req: IncomingMessage, res: ServerResponse, options: CreateGitApiHandlerOptions) {
  const request = createApiRequestContext(req, options);
  if (await rejectUnsupportedMethod(req, res, request)) return;

  const route = parseGitApiRoute(request.url.pathname, options.basePath);
  if (!route) {
    writeRouteNotFound(req, res, request);
    return;
  }

  const repositoryContext = await resolveRepositoryContext(req, res, options, request, route.repositoryKey);
  if (!repositoryContext) return;

  const auth = await authorizeApiRequest(options, req, request, route, repositoryContext);
  if (!auth.allowed) {
    writeAuthorizationDenied(req, res, request, route.action, repositoryContext, auth);
    return;
  }

  try {
    if (await maybeWriteArchive(req, res, options, request, route, repositoryContext)) return;
    const rawData = await runGitApiAction(options, route, repositoryContext.repositoryId, request.url.searchParams);
    const data = await enrichRepositoryDataWithArchives(options, { ...route, repositoryId: repositoryContext.repositoryId } as any, rawData);
    writeActionSuccess(req, res, request, route.action, repositoryContext, data);
  } catch (error) {
    writeActionError(req, res, request, route.action, repositoryContext, error);
  }
}

function createApiRequestContext(req: IncomingMessage, options: CreateGitApiHandlerOptions) {
  return {
    logGroup: "trebired.git-host.api",
    logger: resolveLogger(options.logger, options.loggerAdapter),
    method: text(req.method).toUpperCase() || "GET",
    url: new URL(String(req.url || "/"), "http://127.0.0.1"),
    verbose: options.verbose === true,
  };
}

async function rejectUnsupportedMethod(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createApiRequestContext>,
): Promise<boolean> {
  if (request.method === "GET" || request.method === "HEAD") return false;
  request.logger.warn(request.logGroup, "rejected unsupported api method", {
    method: request.method,
    pathname: String(req.url || "/"),
  });
  res.setHeader("allow", "GET, HEAD");
  writeJson(req, res, 405, {
    ok: false,
    error: {
      code: "method_not_allowed",
      message: "Only GET and HEAD are supported.",
    },
  });
  return true;
}

async function resolveRepositoryContext(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateGitApiHandlerOptions,
  request: ReturnType<typeof createApiRequestContext>,
  repositoryKey: string,
) {
  const repositoryId = text(options.resolveRepositoryId ? await options.resolveRepositoryId(repositoryKey, req) : repositoryKey);
  if (repositoryId) return { repositoryId, repositoryKey };

  request.logger.warn(request.logGroup, "api repository not found", {
    method: request.method,
    pathname: request.url.pathname,
    repositoryKey,
  });
  writeJson(req, res, 404, {
    ok: false,
    error: {
      code: "repository_not_found",
      message: "Repository not found.",
    },
  });
  return null;
}

async function authorizeApiRequest(
  options: CreateGitApiHandlerOptions,
  req: IncomingMessage,
  request: ReturnType<typeof createApiRequestContext>,
  route: NonNullable<ReturnType<typeof parseGitApiRoute>>,
  repositoryContext: { repositoryId: string; repositoryKey: string },
) {
  const result = options.authorize
    ? await options.authorize({
      action: route.action,
      commitRef: "commitRef" in route ? route.commitRef : undefined,
      method: request.method,
      pathname: request.url.pathname,
      remoteAddress: text(req.socket && req.socket.remoteAddress),
      repositoryId: repositoryContext.repositoryId,
      repositoryKey: repositoryContext.repositoryKey,
      refName: "refName" in route ? route.refName : undefined,
      request: req,
      searchParams: request.url.searchParams,
    })
    : undefined;
  return authorizationAllowed(result);
}

function writeAuthorizationDenied(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createApiRequestContext>,
  action: string,
  repositoryContext: { repositoryId: string; repositoryKey: string },
  auth: ReturnType<typeof authorizationAllowed>,
): void {
  applyAuthorizationHeaders(res, auth.headers);
  request.logger.warn(request.logGroup, "api permission denied", {
    action,
    method: request.method,
    pathname: request.url.pathname,
    repositoryId: repositoryContext.repositoryId,
    repositoryKey: repositoryContext.repositoryKey,
    status: auth.status || 403,
  });
  if (isArchiveDownloadAction(action)) {
    request.logger.warn(request.logGroup, "archive download denied", {
      action,
      method: request.method,
      pathname: request.url.pathname,
      repositoryId: repositoryContext.repositoryId,
      repositoryKey: repositoryContext.repositoryKey,
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
}

async function maybeWriteArchive(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateGitApiHandlerOptions,
  request: ReturnType<typeof createApiRequestContext>,
  route: NonNullable<ReturnType<typeof parseGitApiRoute>>,
  repositoryContext: { repositoryId: string; repositoryKey: string },
): Promise<boolean> {
  if (!isArchiveDownloadAction(route.action)) return false;
  request.logger.info(request.logGroup, "archive download authorized", {
    action: route.action,
    method: request.method,
    pathname: request.url.pathname,
    repositoryId: repositoryContext.repositoryId,
    repositoryKey: repositoryContext.repositoryKey,
  });
  await writeArchiveDownload(req, res, options.gitHost, {
    ref: "refName" in route ? route.refName : "HEAD",
    repositoryId: repositoryContext.repositoryId,
    repositoryKey: repositoryContext.repositoryKey,
    routeAction: route.action,
  });
  return true;
}

function writeActionSuccess(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createApiRequestContext>,
  action: string,
  repositoryContext: { repositoryId: string; repositoryKey: string },
  data: unknown,
): void {
  if (request.verbose) {
    request.logger.info(request.logGroup, "api action completed", {
      action,
      method: request.method,
      pathname: request.url.pathname,
      repositoryId: repositoryContext.repositoryId,
      repositoryKey: repositoryContext.repositoryKey,
    });
  }
  writeJson(req, res, 200, {
    ok: true,
    action,
    data,
    repository_id: repositoryContext.repositoryId,
    repository_key: repositoryContext.repositoryKey,
  });
}

function writeActionError(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createApiRequestContext>,
  action: string,
  repositoryContext: { repositoryId: string; repositoryKey: string },
  error: unknown,
): void {
  request.logger.error(request.logGroup, "api action failed", {
    action,
    error: error instanceof Error ? error.message : String(error),
    method: request.method,
    pathname: request.url.pathname,
    repositoryId: repositoryContext.repositoryId,
    repositoryKey: repositoryContext.repositoryKey,
  });
  writeJson(req, res, statusForError(error), serializeError(error));
}

function writeRouteNotFound(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createApiRequestContext>,
): void {
  if (request.verbose) {
    request.logger.warn(request.logGroup, "api route not found", {
      method: request.method,
      pathname: request.url.pathname,
    });
  }
  writeJson(req, res, 404, {
    ok: false,
    error: {
      code: "route_not_found",
      message: "Git API route not found.",
    },
  });
}

export { handleGitApiRequest };
