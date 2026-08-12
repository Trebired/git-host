import { Server as SocketIoServer } from "socket.io";
import { logPackageInitialized } from "@package/logger-adapter";

import { buildGitHostLogGroup, GIT_HOST_PACKAGE_NAME } from "#0bba403f3e43";
import { resolveLogger } from "#5a29135e56c1";
import type { CreateGitForgeSocketServerOptions } from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { normalizeSocketPath } from "#omwpz9vv7et8";
import {
  ACTIONS_RUN_DONE_EVENT,
  ACTIONS_RUN_ERROR_EVENT,
  ACTIONS_RUN_EVENT,
  ACTIONS_RUN_SUBSCRIBE_EVENT,
} from "#e1ead083c558";
import { createRunSubscriptionHandler } from "./socket_subscription.js";

function createGitForgeSocketServer(options: CreateGitForgeSocketServerOptions) {
  if (!options || typeof options.forge !== "object") {
    throw new TypeError("createGitForgeSocketServer() requires a forge instance.");
  }
  if (!options.httpServer) {
    throw new TypeError("createGitForgeSocketServer() requires an httpServer.");
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const logGroup = buildGitHostLogGroup("forge", "socket");
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
