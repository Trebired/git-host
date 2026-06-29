import { Server as SocketIoServer } from "socket.io";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitForgeSocketServerOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import {
  ACTIONS_RUN_DONE_EVENT,
  ACTIONS_RUN_ERROR_EVENT,
  ACTIONS_RUN_EVENT,
  ACTIONS_RUN_SUBSCRIBE_EVENT,
} from "#e1ead083c558";
import { createRunSubscriptionHandler } from "./socket_subscription.js";

function normalizeSocketPath(basePathInput: unknown, socketPathInput: unknown): string {
  const socketPath = text(socketPathInput).replace(/\/+$/g, "");
  if (socketPath) {
    return socketPath.startsWith("/") ? socketPath : `/${socketPath}`;
  }

  const basePath = text(basePathInput).replace(/\/+$/g, "");
  if (!basePath || basePath === "/") return "/socket.io";
  return `${basePath.startsWith("/") ? basePath : `/${basePath}`}/socket.io`;
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
  const handleRunSubscription = createRunSubscriptionHandler(options, logger, logGroup, basePath, verbose);

  io.on("connection", (socket) => {
    socket.on(ACTIONS_RUN_SUBSCRIBE_EVENT, (payload?: {
      afterSequence?: number;
      repositoryKey?: string;
      runId?: string;
    }) => {
      void handleRunSubscription(socket, payload);
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
