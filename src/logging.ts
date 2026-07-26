import {
  resolveLogger as resolveSharedLogger,
} from "@package/logger-adapter";

import { GIT_HOST_PACKAGE_NAME } from "./constants.js";
import type {
  GitHostLogger,
  GitHostLoggerAdapter,
  NormalizedGitHostLogger,
} from "./types.js";

function resolveLogger(
  logger?: GitHostLogger,
  adapter?: GitHostLoggerAdapter,
): NormalizedGitHostLogger {
  return resolveSharedLogger({
    adapter,
    fallback: "console",
    logger,
    source: GIT_HOST_PACKAGE_NAME,
  }) as NormalizedGitHostLogger;
}

export { resolveLogger };
