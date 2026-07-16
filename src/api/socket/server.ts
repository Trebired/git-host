import { Server as SocketIoServer } from "socket.io";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { resolveLogger } from "#5a29135e56c1";
import type {
  CreateGitApiSocketServerOptions,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import {
  LINGUIST_DONE_EVENT,
  LINGUIST_ERROR_EVENT,
  LINGUIST_PROGRESS_EVENT,
  LINGUIST_RESULT_EVENT,
  LINGUIST_START_EVENT,
} from "./events.js";
import { createLinguistConnectionHandler } from "./linguist_connection.js";

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
  const logGroup = "trebired.git-host.api.socket";
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
  const handleLinguistSocket = createLinguistConnectionHandler(options, logger, logGroup, basePath, verbose);

  io.on("connection", (socket) => {
    socket.on(LINGUIST_START_EVENT, (payload?: { ref?: string; repositoryKey?: string }) => {
      void handleLinguistSocket(socket, payload);
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
