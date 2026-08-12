import { Server as SocketIoServer } from "socket.io";
import { logPackageInitialized } from "@package/logger-adapter";

import { buildGitHostLogGroup, GIT_HOST_PACKAGE_NAME } from "#0bba403f3e43";
import { resolveLogger } from "#5a29135e56c1";
import type {
  CreateGitApiSocketServerOptions,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { normalizeSocketPath } from "#omwpz9vv7et8";
import {
  LINGUIST_DONE_EVENT,
  LINGUIST_ERROR_EVENT,
  LINGUIST_PROGRESS_EVENT,
  LINGUIST_RESULT_EVENT,
  LINGUIST_START_EVENT,
} from "./events.js";
import { createLinguistConnectionHandler } from "./linguist_connection.js";

function createGitApiSocketServer(options: CreateGitApiSocketServerOptions) {
  if (!options || typeof options.gitHost !== "object") {
    throw new TypeError("createGitApiSocketServer() requires a gitHost instance.");
  }
  if (!options.httpServer) {
    throw new TypeError("createGitApiSocketServer() requires an httpServer.");
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const logGroup = buildGitHostLogGroup("api", "socket");
  logPackageInitialized({
      adapter: options.loggerAdapter,
      fallback: "console",
      group: logGroup,
      logger: options.logger,
      source: GIT_HOST_PACKAGE_NAME,
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
