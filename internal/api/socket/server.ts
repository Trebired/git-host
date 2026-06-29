import { Server as SocketIoServer } from "socket.io";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { resolveLogger } from "#5a29135e56c1";
import type {
  CreateGitApiSocketServerOptions,
  GitLinguistProgressEvent,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import {
  LINGUIST_DONE_EVENT,
  LINGUIST_ERROR_EVENT,
  LINGUIST_PROGRESS_EVENT,
  LINGUIST_RESULT_EVENT,
  LINGUIST_START_EVENT,
} from "./events.js";
import { authorizationAllowed, serializeError, statusForError } from "#4e7ff1c92ff1";

function normalizeSocketPath(basePathInput: unknown, socketPathInput: unknown): string {
  const socketPath = text(socketPathInput).replace(/\/+$/g, "");
  if (socketPath) {
    return socketPath.startsWith("/") ? socketPath : `/${socketPath}`;
  }

  const basePath = text(basePathInput).replace(/\/+$/g, "");
  if (!basePath || basePath === "/") return "/socket.io";
  return `${basePath.startsWith("/") ? basePath : `/${basePath}`}/socket.io`;
}

function createGitApiSocketServer(options: CreateGitApiSocketServerOptions) {
  if (!options || typeof options.gitHost !== "object") {
    throw new TypeError("createGitApiSocketServer() requires a gitHost instance.");
  }
  if (!options.httpServer) {
    throw new TypeError("createGitApiSocketServer() requires an httpServer.");
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const logGroup = "git-host.api.socket";
  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: logGroup,
    logger: options.logger,
    source: "@trebired/git-host",
  });
  const verbose = options.verbose === true;
  const basePath = text(options.basePath, "/api/git");
  const path = normalizeSocketPath(basePath, options.socketPath);
  const io = new SocketIoServer(options.httpServer, {
    ...(options.socketOptions || {}),
    path,
  });

  io.on("connection", (socket) => {
    socket.on(LINGUIST_START_EVENT, async (payload?: { ref?: string; repositoryKey?: string }) => {
      const repositoryKey = text(payload && payload.repositoryKey);
      const ref = text(payload && payload.ref);
      const pathname = `${basePath.replace(/\/+$/g, "") || ""}/repositories/${encodeURIComponent(repositoryKey)}/linguist/socket`;

      if (!repositoryKey) {
        socket.emit(LINGUIST_ERROR_EVENT, {
          error: {
            code: "repository_not_found",
            message: "Repository key is required.",
          },
          status: 404,
        });
        socket.emit(LINGUIST_DONE_EVENT, { ok: false });
        socket.disconnect();
        return;
      }

      const repositoryId = text(options.resolveRepositoryId
        ? await options.resolveRepositoryId(repositoryKey, socket.request)
        : repositoryKey);
      if (!repositoryId) {
        socket.emit(LINGUIST_ERROR_EVENT, {
          error: {
            code: "repository_not_found",
            message: "Repository not found.",
          },
          status: 404,
        });
        socket.emit(LINGUIST_DONE_EVENT, { ok: false, repository_key: repositoryKey });
        socket.disconnect();
        return;
      }

      const searchParams = new URLSearchParams();
      if (ref) searchParams.set("ref", ref);

      const auth = authorizationAllowed(options.authorize
        ? await options.authorize({
          action: "linguist_socket",
          method: "SOCKET",
          pathname,
          remoteAddress: text(socket.handshake.address),
          repositoryId,
          repositoryKey,
          request: socket.request,
          searchParams,
        })
        : undefined);

      if (!auth.allowed) {
        logger.warn(logGroup, "api socket permission denied", {
          action: "linguist_socket",
          pathname,
          repositoryId,
          repositoryKey,
          status: auth.status || 403,
        });
        socket.emit(LINGUIST_ERROR_EVENT, {
          error: {
            code: "permission_denied",
            message: auth.message || "Permission denied.",
          },
          status: auth.status || 403,
        });
        socket.emit(LINGUIST_DONE_EVENT, {
          ok: false,
          repository_id: repositoryId,
          repository_key: repositoryKey,
        });
        socket.disconnect();
        return;
      }

      try {
        const data = await options.gitHost.readLinguist(repositoryId, {
          onProgress(progressEvent: GitLinguistProgressEvent) {
            socket.emit(LINGUIST_PROGRESS_EVENT, progressEvent);
          },
          ref,
        });
        socket.emit(LINGUIST_RESULT_EVENT, {
          action: "linguist",
          data,
          repository_id: repositoryId,
          repository_key: repositoryKey,
        });
        socket.emit(LINGUIST_DONE_EVENT, {
          ok: true,
          repository_id: repositoryId,
          repository_key: repositoryKey,
        });
        if (verbose) {
          logger.info(logGroup, "api linguist socket completed", {
            repositoryId,
            repositoryKey,
            socketId: socket.id,
          });
        }
      } catch (error) {
        logger.error(logGroup, "api linguist socket failed", {
          error: error instanceof Error ? error.message : String(error),
          repositoryId,
          repositoryKey,
          socketId: socket.id,
        });
        socket.emit(LINGUIST_ERROR_EVENT, {
          ...serializeError(error),
          ok: false,
          repository_id: repositoryId,
          repository_key: repositoryKey,
          status: statusForError(error),
        });
        socket.emit(LINGUIST_DONE_EVENT, {
          ok: false,
          repository_id: repositoryId,
          repository_key: repositoryKey,
        });
      } finally {
        socket.disconnect();
      }
    });
  });

  return io;
}

export {
  createGitApiSocketServer,
  LINGUIST_DONE_EVENT,
  LINGUIST_ERROR_EVENT,
  LINGUIST_PROGRESS_EVENT,
  LINGUIST_RESULT_EVENT,
  LINGUIST_START_EVENT,
};
