import type { IncomingMessage, ServerResponse } from "node:http";
import { logPackageInitialized } from "@package/logger-adapter";

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
    group: "package.git-host.api",
    logger: options.logger,
    source: "@package/git-host",
  });

  return function gitApiHandler(req: IncomingMessage, res: ServerResponse) {
    void handleGitApiRequest(req, res, options).catch((error) => {
      writeJson(req, res, 500, serializeError(error));
    });
  };
}

export { createGitApiHandler, parseGitApiRoute };
