import {
  resolveLogger as resolveSharedLogger,
} from "@trebired/logger-adapter";

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
    source: "@trebired/git-host",
  }) as NormalizedGitHostLogger;
}

export { resolveLogger };
