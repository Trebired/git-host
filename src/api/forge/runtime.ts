import type { IncomingMessage, ServerResponse } from "node:http";

import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitForgeApiHandlerOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { isArchiveDownloadAction, writeArchiveDownload, writeReleaseAssetDownload } from "#1uaqd3hnpa5k";
import type { GitForgeActor } from "#1mbdfxwwqqpa";
import { runGitApiAction } from "#t13y2bx0ygbf";
import {
  applyAuthorizationHeaders,
  authorizationAllowed,
  serializeError,
  statusForError,
  writeJson,
} from "#oul7o8qvkv5n";
import { allowedMethodsForRoute, readJsonBody, routeOperation, runForgeAction } from "./actions.js";
import { enrichForgeDataWithArchives } from "./archives.js";
import { parseGitForgeApiRoute } from "./route.js";

async function handleGitForgeApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateGitForgeApiHandlerOptions,
) {
  const request = createForgeRequestContext(req, options);
  const route = parseGitForgeApiRoute(request.url.pathname, options.basePath);
  if (!route) {
    writeJson(req, res, 404, {
      ok: false,
      error: { code: "route_not_found", message: "Git forge API route not found." },
    });
    return;
  }

  if (rejectUnsupportedForgeMethod(req, res, request.method, allowedMethodsForRoute(route))) return;
  const repositoryContext = await resolveForgeRepository(req, res, options, route.repositoryKey);
  if (!repositoryContext) return;

  const actor = options.resolveActor ? await options.resolveActor(req) : null;
  const auth = await authorizeForgeRequest(options, req, request, route, actor, repositoryContext);
  applyAuthorizationHeaders(res, auth.headers);
  if (!auth.allowed) {
    writeForgeDenied(req, res, request, route.action, repositoryContext, auth);
    return;
  }

  const body = await readForgeBody(req, request.method);
  try {
    if (await maybeWriteForgeDownload(req, res, options, request, route, repositoryContext)) return;
    const rawData = await runForgeOrRepositoryAction(options, route, repositoryContext.repositoryId, actor, body, request.url.searchParams);
    const data = await enrichForgeDataWithArchives(options, route, repositoryContext.repositoryId, rawData);
    writeForgeSuccess(req, res, request, route.action, repositoryContext, data);
  } catch (error) {
    writeForgeError(req, res, request, route.action, repositoryContext.repositoryId, error);
  }
}

function createForgeRequestContext(req: IncomingMessage, options: CreateGitForgeApiHandlerOptions) {
  return {
    logGroup: "trebired.git-host.forge.api",
    logger: resolveLogger(options.logger, options.loggerAdapter),
    method: text(req.method).toUpperCase() || "GET",
    url: new URL(String(req.url || "/"), "http://127.0.0.1"),
    verbose: options.verbose === true,
  };
}

function rejectUnsupportedForgeMethod(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  allowedMethods: string[],
): boolean {
  if (allowedMethods.includes(method)) return false;
  res.setHeader("allow", allowedMethods.join(", "));
  writeJson(req, res, 405, {
    ok: false,
    error: {
      code: "method_not_allowed",
      message: `Supported methods: ${allowedMethods.join(", ")}.`,
    },
  });
  return true;
}

async function resolveForgeRepository(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateGitForgeApiHandlerOptions,
  repositoryKey: string,
) {
  const repositoryId = text(options.resolveRepositoryId ? await options.resolveRepositoryId(repositoryKey, req) : repositoryKey);
  if (repositoryId) return { repositoryId, repositoryKey };
  writeJson(req, res, 404, {
    ok: false,
    error: { code: "repository_not_found", message: "Repository not found." },
  });
  return null;
}

async function authorizeForgeRequest(
  options: CreateGitForgeApiHandlerOptions,
  req: IncomingMessage,
  request: ReturnType<typeof createForgeRequestContext>,
  route: NonNullable<ReturnType<typeof parseGitForgeApiRoute>>,
  actor: GitForgeActor | null,
  repositoryContext: { repositoryId: string; repositoryKey: string },
) {
  const result = options.authorize
    ? await options.authorize({
      action: route.action,
      actor,
      assetId: "assetId" in route ? route.assetId : undefined,
      method: request.method,
      operation: routeOperation(route, request.method),
      pathname: request.url.pathname,
      runId: "runId" in route ? route.runId : undefined,
      releaseId: "releaseId" in route ? route.releaseId : undefined,
      remoteAddress: text(req.socket && req.socket.remoteAddress),
      repositoryId: repositoryContext.repositoryId,
      repositoryKey: repositoryContext.repositoryKey,
      request: req,
      resource: route.resource,
      searchParams: request.url.searchParams,
    })
    : undefined;
  return authorizationAllowed(result);
}

function writeForgeDenied(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createForgeRequestContext>,
  action: string,
  repositoryContext: { repositoryId: string; repositoryKey: string },
  auth: ReturnType<typeof authorizationAllowed>,
) {
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
    error: { code: "permission_denied", message: auth.message || "Permission denied." },
  });
}

async function readForgeBody(req: IncomingMessage, method: string) {
  if (method !== "POST" && method !== "PATCH" && method !== "DELETE") return {};
  const body = await readJsonBody(req);
  body._method = method;
  return body;
}

async function maybeWriteForgeDownload(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateGitForgeApiHandlerOptions,
  request: ReturnType<typeof createForgeRequestContext>,
  route: NonNullable<ReturnType<typeof parseGitForgeApiRoute>>,
  repositoryContext: { repositoryId: string; repositoryKey: string },
): Promise<boolean> {
  if (isArchiveDownloadAction(route.action)) {
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
  if (route.action === "asset") {
    await writeReleaseAssetDownload(req, res, options.forge, {
      assetId: route.assetId,
      releaseId: route.releaseId,
      repositoryId: repositoryContext.repositoryId,
      repositoryKey: repositoryContext.repositoryKey,
    });
    return true;
  }
  return false;
}

async function runForgeOrRepositoryAction(
  options: CreateGitForgeApiHandlerOptions,
  route: NonNullable<ReturnType<typeof parseGitForgeApiRoute>>,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
) {
  if (route.resource === "repository" && route.action !== "overview" && route.action !== "social" && route.action !== "activity") {
    return await runGitApiAction({ gitHost: options.gitHost } as any, route as any, repositoryId, searchParams);
  }
  return await runForgeAction(options, route, repositoryId, actor, body, searchParams);
}

function writeForgeSuccess(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createForgeRequestContext>,
  action: string,
  repositoryContext: { repositoryId: string; repositoryKey: string },
  data: unknown,
) {
  if (request.verbose) {
    request.logger.info(request.logGroup, "forge api action completed", {
      action,
      method: request.method,
      pathname: request.url.pathname,
      repositoryId: repositoryContext.repositoryId,
    });
  }
  writeJson(req, res, 200, {
    action,
    data,
    ok: true,
    repository_id: repositoryContext.repositoryId,
    repository_key: repositoryContext.repositoryKey,
  });
}

function writeForgeError(
  req: IncomingMessage,
  res: ServerResponse,
  request: ReturnType<typeof createForgeRequestContext>,
  action: string,
  repositoryId: string,
  error: unknown,
) {
  request.logger.error(request.logGroup, "forge api action failed", {
    action,
    error: error instanceof Error ? error.message : String(error),
    method: request.method,
    pathname: request.url.pathname,
    repositoryId,
  });
  writeJson(req, res, statusForError(error), serializeError(error));
}

export { handleGitForgeApiRequest };
