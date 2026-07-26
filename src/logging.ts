import {
  resolveLogger as resolveSharedLogger,
} from "@package/logger-adapter";

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
    source: "@package/git-host",
  }) as NormalizedGitHostLogger;
}

export { resolveLogger };
