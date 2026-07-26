import type { IncomingMessage, ServerResponse } from "node:http";
import { logPackageInitialized } from "@package/logger-adapter";

import type { CreateGitForgeApiHandlerOptions } from "#1mbdfxwwqqpa";
import { serializeError, writeJson } from "#4e7ff1c92ff1";
import { parseGitForgeApiRoute } from "./route.js";
import { handleGitForgeApiRequest } from "./runtime.js";

function createGitForgeApiHandler(options: CreateGitForgeApiHandlerOptions) {
  if (!options || typeof options.forge !== "object") {
    throw new TypeError("createGitForgeApiHandler() requires a forge instance.");
  }

  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "package.git-host.forge.api",
    logger: options.logger,
    source: "@package/git-host",
  });

  return function gitForgeApiHandler(req: IncomingMessage, res: ServerResponse) {
    void handleGitForgeApiRequest(req, res, options).catch((error) => {
      writeJson(req, res, 500, serializeError(error));
    });
  };
}

export { createGitForgeApiHandler, parseGitForgeApiRoute };
