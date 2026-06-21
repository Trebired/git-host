import type { IncomingMessage, ServerResponse } from "node:http";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { GitHostError } from "#ebw9yuqcyi9w";
import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitForgeApiHandlerOptions, GitForgeActor, GitForgeOperation, GitForgeRelease, GitForgeRepositoryOverview } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import {
  attachReleaseSourceArchives,
  enrichRepositoryDataWithArchives,
  isArchiveDownloadAction,
  writeArchiveDownload,
  writeReleaseAssetDownload,
} from "#1uaqd3hnpa5k";
import { runGitApiAction } from "#t13y2bx0ygbf";
import {
  applyAuthorizationHeaders,
  authorizationAllowed,
  serializeError,
  statusForError,
  writeJson,
} from "#oul7o8qvkv5n";
import { parseGitForgeApiRoute, type GitForgeApiRoute } from "./route.js";

function routeOperation(route: GitForgeApiRoute, method: string): GitForgeOperation {
  if ("resource" in route && route.resource === "repository" && !("releaseId" in route) && !("forkId" in route)) return "read";
  switch (route.action) {
    case "asset":
      return "read";
    case "stars":
      return method === "DELETE" ? "delete" : "create";
    case "watch":
      return "subscribe";
    case "releases":
      return method === "POST" ? "create" : "read";
    case "release":
      if (method === "PATCH") return "update";
      if (method === "DELETE") return "delete";
      return "read";
    case "forks":
      return method === "POST" ? "create" : "read";
    case "fork_sync":
      return "sync";
    default:
      return "read";
  }
}

function allowedMethodsForRoute(route: GitForgeApiRoute): string[] {
  switch (route.action) {
    case "stars":
    case "watch":
      return ["DELETE", "POST"];
    case "releases":
    case "forks":
      return ["GET", "HEAD", "POST"];
    case "asset":
      return ["GET", "HEAD"];
    case "release":
      return ["DELETE", "GET", "HEAD", "PATCH"];
    case "fork_sync":
      return ["POST"];
    default:
      return ["GET", "HEAD"];
  }
}

function isForgeReleasePayload(value: unknown): value is GitForgeRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<GitForgeRelease>;
  return typeof release.id === "string"
    && typeof release.tag_name === "string"
    && Array.isArray(release.assets);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return parsed && typeof parsed === "object" ? parsed : {};
}

async function runForgeAction(
  options: CreateGitForgeApiHandlerOptions,
  route: GitForgeApiRoute,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
) {
  switch (route.action) {
    case "overview":
      return await options.forge.readOverview(repositoryId, { actorId: actor?.id });
    case "social":
      return await options.forge.readSocialState(repositoryId, { actorId: actor?.id });
    case "stars":
      return body && body._method === "DELETE"
        ? await options.forge.unstarRepository(repositoryId, { actor: actor as GitForgeActor })
        : await options.forge.starRepository(repositoryId, { actor: actor as GitForgeActor });
    case "watch":
      return body && body._method === "DELETE"
        ? await options.forge.unwatchRepository(repositoryId, { actor: actor as GitForgeActor })
        : await options.forge.watchRepository(repositoryId, { actor: actor as GitForgeActor });
    case "releases":
      if (body && body._method === "POST") {
        return await options.forge.createRelease(repositoryId, {
          actor: actor as GitForgeActor,
          assets: Array.isArray(body.assets) ? body.assets as any[] : undefined,
          createTag: body.createTag && typeof body.createTag === "object" ? {
            annotatedMessage: text((body.createTag as Record<string, unknown>).annotatedMessage),
            name: text((body.createTag as Record<string, unknown>).name),
            targetRef: text((body.createTag as Record<string, unknown>).targetRef),
          } : undefined,
          draft: body.draft === true,
          existingTagName: text(body.existingTagName),
          notes: text(body.notes),
          prerelease: body.prerelease === true,
          publishedAt: body.publishedAt === null ? null : text(body.publishedAt),
          title: text(body.title),
        });
      }
      return await options.forge.listReleases(repositoryId);
    case "release":
      if (body && body._method === "PATCH") {
        return await options.forge.updateRelease(repositoryId, route.releaseId, {
          actor: actor as GitForgeActor,
          assets: Array.isArray(body.assets) ? body.assets as any[] : undefined,
          draft: body.draft === true,
          notes: text(body.notes),
          prerelease: body.prerelease === true,
          publishedAt: body.publishedAt === null ? null : (body.publishedAt === undefined ? undefined : text(body.publishedAt)),
          title: body.title === undefined ? undefined : text(body.title),
        });
      }
      if (body && body._method === "DELETE") {
        await options.forge.deleteRelease(repositoryId, route.releaseId, {
          actor: actor as GitForgeActor,
          deleteTag: body.deleteTag === true,
        });
        return {
          deleted: true,
          release_id: route.releaseId,
        };
      }
      return await options.forge.readRelease(repositoryId, route.releaseId);
    case "forks":
      if (body && body._method === "POST") {
        return await options.forge.createFork(repositoryId, {
          actor: actor as GitForgeActor,
        });
      }
      return await options.forge.listForks(repositoryId);
    case "fork_sync":
      return await options.forge.syncFork(route.forkId, {
        actor: actor as GitForgeActor,
        strategy: text(body.strategy) === "merge" ? "merge" : undefined,
      });
    case "activity":
      return await options.forge.listActivity(repositoryId);
    default:
      return await runGitApiAction({
        gitHost: options.gitHost,
      } as any, route as any, repositoryId, new URLSearchParams());
  }
}

async function enrichForgeDataWithArchives(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath" | "forge" | "gitHost">,
  route: GitForgeApiRoute,
  repositoryId: string,
  data: unknown,
) {
  if (route.resource === "repository") {
    return await enrichRepositoryDataWithArchives({
      basePath: options.basePath,
      gitHost: options.gitHost,
    }, {
      ...route,
      repositoryId,
    } as any, data);
  }

  if (route.action === "release" && isForgeReleasePayload(data)) {
    try {
      return await attachReleaseSourceArchives(options, repositoryId, route.repositoryKey, data as GitForgeRelease);
    } catch (error) {
      if (error instanceof GitHostError && error.code === "archive_ref_not_found") {
        const release = data as GitForgeRelease;
        throw new GitHostError("release_tag_not_found", `Release "${release.id}" points at missing tag "${release.tag_name}" in repository "${repositoryId}".`, {
          releaseId: release.id,
          repositoryId,
          tag: release.tag_name,
        });
      }
      throw error;
    }
  }

  if (route.action === "releases" && Array.isArray(data)) {
    return await Promise.all(data.map(async (release) => {
      return await enrichForgeDataWithArchives(options, {
        action: "release",
        releaseId: text((release as GitForgeRelease).id),
        repositoryKey: route.repositoryKey,
        resource: "release",
      }, repositoryId, release);
    }));
  }

  if (route.action === "releases" && isForgeReleasePayload(data)) {
    return await enrichForgeDataWithArchives(options, {
      action: "release",
      releaseId: text((data as GitForgeRelease).id),
      repositoryKey: route.repositoryKey,
      resource: "release",
    }, repositoryId, data);
  }

  if (route.action === "overview" && data && typeof data === "object") {
    const overview = data as GitForgeRepositoryOverview;
    return {
      ...overview,
      latest_release: overview.latest_release
        ? await enrichForgeDataWithArchives(options, {
          action: "release",
          releaseId: overview.latest_release.id,
          repositoryKey: route.repositoryKey,
          resource: "release",
        }, repositoryId, overview.latest_release) as GitForgeRelease
        : null,
    };
  }

  return data;
}

async function handleGitForgeApiRequest(req: IncomingMessage, res: ServerResponse, options: CreateGitForgeApiHandlerOptions) {
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const verbose = options.verbose === true;
  const logGroup = "git-host.forge.api";
  const method = text(req.method).toUpperCase() || "GET";

  const url = new URL(String(req.url || "/"), "http://127.0.0.1");
  const route = parseGitForgeApiRoute(url.pathname, options.basePath);
  if (!route) {
    writeJson(req, res, 404, {
      ok: false,
      error: {
        code: "route_not_found",
        message: "Git forge API route not found.",
      },
    });
    return;
  }

  const allowedMethods = allowedMethodsForRoute(route);
  if (!allowedMethods.includes(method)) {
    res.setHeader("allow", allowedMethods.join(", "));
    writeJson(req, res, 405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: `Supported methods: ${allowedMethods.join(", ")}.`,
      },
    });
    return;
  }

  const repositoryKey = route.repositoryKey;
  const repositoryId = text(options.resolveRepositoryId ? await options.resolveRepositoryId(repositoryKey, req) : repositoryKey);
  if (!repositoryId) {
    writeJson(req, res, 404, {
      ok: false,
      error: {
        code: "repository_not_found",
        message: "Repository not found.",
      },
    });
    return;
  }

  const actor = options.resolveActor ? await options.resolveActor(req) : null;
  const auth = authorizationAllowed(options.authorize
    ? await options.authorize({
      action: route.action,
      actor,
      assetId: "assetId" in route ? route.assetId : undefined,
      method,
      operation: routeOperation(route, method),
      pathname: url.pathname,
      releaseId: "releaseId" in route ? route.releaseId : undefined,
      remoteAddress: text(req.socket && req.socket.remoteAddress),
      repositoryId,
      repositoryKey,
      request: req,
      resource: route.resource,
      searchParams: url.searchParams,
    })
    : undefined);

  applyAuthorizationHeaders(res, auth.headers);
  if (!auth.allowed) {
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

  const body = method === "POST" || method === "PATCH" || method === "DELETE"
    ? await readJsonBody(req)
    : {};
  if (method === "POST" || method === "PATCH" || method === "DELETE") {
    body._method = method;
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

    if (route.action === "asset") {
      await writeReleaseAssetDownload(req, res, options.forge, {
        assetId: route.assetId,
        releaseId: route.releaseId,
        repositoryId,
        repositoryKey,
      });
      return;
    }

    const rawData = route.resource === "repository" && route.action !== "overview" && route.action !== "social" && route.action !== "activity"
      ? await runGitApiAction({
        gitHost: options.gitHost,
      } as any, route as any, repositoryId, url.searchParams)
      : await runForgeAction(options, route, repositoryId, actor, body);
    const data = await enrichForgeDataWithArchives(options, route, repositoryId, rawData);
    if (verbose) {
      logger.info(logGroup, "forge api action completed", {
        action: route.action,
        method,
        pathname: url.pathname,
        repositoryId,
      });
    }
    writeJson(req, res, 200, {
      action: route.action,
      data,
      ok: true,
      repository_id: repositoryId,
      repository_key: repositoryKey,
    });
  } catch (error) {
    logger.error(logGroup, "forge api action failed", {
      action: route.action,
      error: error instanceof Error ? error.message : String(error),
      method,
      pathname: url.pathname,
      repositoryId,
    });
    writeJson(req, res, statusForError(error), serializeError(error));
  }
}

function createGitForgeApiHandler(options: CreateGitForgeApiHandlerOptions) {
  if (!options || typeof options.forge !== "object") {
    throw new TypeError("createGitForgeApiHandler() requires a forge instance.");
  }

  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "git-host.forge.api",
    logger: options.logger,
    source: "@trebired/git-host",
  });

  return function gitForgeApiHandler(req: IncomingMessage, res: ServerResponse) {
    void handleGitForgeApiRequest(req, res, options).catch((error) => {
      writeJson(req, res, 500, serializeError(error));
    });
  };
}

export { createGitForgeApiHandler, parseGitForgeApiRoute };
