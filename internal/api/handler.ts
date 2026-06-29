import type { IncomingMessage, ServerResponse } from "node:http";
import { logPackageInitialized } from "@trebired/logger-adapter";

import type { CreateGitApiHandlerOptions } from "#1mbdfxwwqqpa";
import { serializeError, writeJson } from "./handler/response.js";
import { parseGitApiRoute } from "./handler/route.js";
import { handleGitApiRequest } from "./handler/runtime.js";

function createGitApiHandler(options: CreateGitApiHandlerOptions) {
  if (!options || typeof options.gitHost !== "object") {
    throw new TypeError("createGitApiHandler() requires a gitHost instance.");
  }

  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "git-host.api",
    logger: options.logger,
    source: "@trebired/git-host",
  });

  return function gitApiHandler(req: IncomingMessage, res: ServerResponse) {
    void handleGitApiRequest(req, res, options).catch((error) => {
      writeJson(req, res, 500, serializeError(error));
    });
  };
}

export { createGitApiHandler, parseGitApiRoute };
