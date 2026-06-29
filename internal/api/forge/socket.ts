import { Server as SocketIoServer } from "socket.io";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitForgeSocketServerOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { authorizationAllowed, serializeError, statusForError } from "#oul7o8qvkv5n";
import {
  ACTIONS_RUN_DONE_EVENT,
  ACTIONS_RUN_ERROR_EVENT,
  ACTIONS_RUN_EVENT,
  ACTIONS_RUN_SUBSCRIBE_EVENT,
} from "../socket/events.js";

function normalizeSocketPath(basePathInput: unknown, socketPathInput: unknown): string {
  const socketPath = text(socketPathInput).replace(/\/+$/g, "");
  if (socketPath) {
    return socketPath.startsWith("/") ? socketPath : `/${socketPath}`;
  }

  const basePath = text(basePathInput).replace(/\/+$/g, "");
  if (!basePath || basePath === "/") return "/socket.io";
  return `${basePath.startsWith("/") ? basePath : `/${basePath}`}/socket.io`;
}

function isTerminalRunEventType(value: string) {
  return value === "run.cancelled" || value === "run.failed" || value === "run.finished";
}

function createGitForgeSocketServer(options: CreateGitForgeSocketServerOptions) {
  if (!options || typeof options.forge !== "object") {
    throw new TypeError("createGitForgeSocketServer() requires a forge instance.");
  }
  if (!options.httpServer) {
    throw new TypeError("createGitForgeSocketServer() requires an httpServer.");
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const logGroup = "git-host.forge.socket";
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
    socket.on(ACTIONS_RUN_SUBSCRIBE_EVENT, async (payload?: {
      afterSequence?: number;
      repositoryKey?: string;
      runId?: string;
    }) => {
      const repositoryKey = text(payload?.repositoryKey);
      const runId = text(payload?.runId);
      const pathname = `${basePath.replace(/\/+$/g, "") || ""}/repositories/${encodeURIComponent(repositoryKey)}/actions/runs/${encodeURIComponent(runId)}/socket`;

      if (!repositoryKey || !runId) {
        socket.emit(ACTIONS_RUN_ERROR_EVENT, {
          error: {
            code: "forge_resource_not_found",
            message: "repositoryKey and runId are required.",
          },
          status: 404,
        });
        socket.emit(ACTIONS_RUN_DONE_EVENT, { ok: false });
        socket.disconnect();
        return;
      }

      const repositoryId = text(options.resolveRepositoryId
        ? await options.resolveRepositoryId(repositoryKey, socket.request)
        : repositoryKey);
      if (!repositoryId) {
        socket.emit(ACTIONS_RUN_ERROR_EVENT, {
          error: {
            code: "repository_not_found",
            message: "Repository not found.",
          },
          status: 404,
        });
        socket.emit(ACTIONS_RUN_DONE_EVENT, { ok: false, repository_key: repositoryKey });
        socket.disconnect();
        return;
      }

      const actor = options.resolveActor ? await options.resolveActor(socket.request) : null;
      const searchParams = new URLSearchParams();
      if (payload?.afterSequence != null) searchParams.set("afterSequence", String(Number(payload.afterSequence) || 0));

      const auth = authorizationAllowed(options.authorize
        ? await options.authorize({
          action: "action_run",
          actor,
          method: "SOCKET",
          operation: "subscribe",
          pathname,
          remoteAddress: text(socket.handshake.address),
          repositoryId,
          repositoryKey,
          request: socket.request,
          resource: "action_run",
          runId,
          searchParams,
        })
        : undefined);

      if (!auth.allowed) {
        logger.warn(logGroup, "forge socket permission denied", {
          action: "action_run",
          pathname,
          repositoryId,
          repositoryKey,
          runId,
          status: auth.status || 403,
        });
        socket.emit(ACTIONS_RUN_ERROR_EVENT, {
          error: {
            code: "permission_denied",
            message: auth.message || "Permission denied.",
          },
          status: auth.status || 403,
        });
        socket.emit(ACTIONS_RUN_DONE_EVENT, {
          ok: false,
          repository_id: repositoryId,
          repository_key: repositoryKey,
          run_id: runId,
        });
        socket.disconnect();
        return;
      }

      let subscription: { close: () => void } | null = null;
      try {
        const events = await options.forge.listWorkflowRunEvents(repositoryId, runId, {
          afterSequence: Number(payload?.afterSequence) || 0,
        });
        for (const event of events) {
          socket.emit(ACTIONS_RUN_EVENT, event);
        }

        const run = await options.forge.readWorkflowRun(repositoryId, runId);
        if (run.status === "cancelled" || run.status === "failed" || run.status === "skipped" || run.status === "success") {
          socket.emit(ACTIONS_RUN_DONE_EVENT, {
            ok: true,
            repository_id: repositoryId,
            repository_key: repositoryKey,
            run_id: runId,
          });
          socket.disconnect();
          return;
        }

        subscription = options.forge.subscribeWorkflowRun(repositoryId, runId, async (event) => {
          socket.emit(ACTIONS_RUN_EVENT, event);
          if (isTerminalRunEventType(event.type)) {
            socket.emit(ACTIONS_RUN_DONE_EVENT, {
              ok: true,
              repository_id: repositoryId,
              repository_key: repositoryKey,
              run_id: runId,
            });
            subscription?.close();
            socket.disconnect();
          }
        });

        socket.on("disconnect", () => {
          subscription?.close();
        });

        if (verbose) {
          logger.info(logGroup, "forge action run socket subscribed", {
            repositoryId,
            repositoryKey,
            runId,
            socketId: socket.id,
          });
        }
      } catch (error) {
        logger.error(logGroup, "forge action run socket failed", {
          error: error instanceof Error ? error.message : String(error),
          repositoryId,
          repositoryKey,
          runId,
          socketId: socket.id,
        });
        socket.emit(ACTIONS_RUN_ERROR_EVENT, {
          ...serializeError(error),
          ok: false,
          repository_id: repositoryId,
          repository_key: repositoryKey,
          run_id: runId,
          status: statusForError(error),
        });
        socket.emit(ACTIONS_RUN_DONE_EVENT, {
          ok: false,
          repository_id: repositoryId,
          repository_key: repositoryKey,
          run_id: runId,
        });
        socket.disconnect();
      }
    });
  });

  return io;
}

export {
  ACTIONS_RUN_DONE_EVENT,
  ACTIONS_RUN_ERROR_EVENT,
  ACTIONS_RUN_EVENT,
  ACTIONS_RUN_SUBSCRIBE_EVENT,
  createGitForgeSocketServer,
};
