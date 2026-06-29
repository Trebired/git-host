import type { IncomingMessage, ServerResponse } from "node:http";
import { logPackageInitialized } from "@trebired/logger-adapter";

import type { CreateGitForgeApiHandlerOptions } from "#1mbdfxwwqqpa";
import { serializeError, writeJson } from "#oul7o8qvkv5n";
import { parseGitForgeApiRoute } from "./route.js";
import { handleGitForgeApiRequest } from "./runtime.js";

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
