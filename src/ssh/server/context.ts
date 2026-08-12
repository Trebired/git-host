import { logPackageInitialized } from "@package/logger-adapter";

import { buildGitHostLogGroup, GIT_HOST_PACKAGE_NAME } from "#0bba403f3e43";
import { resolveLogger } from "#5a29135e56c1";
import type { CreateGitSshServerOptions } from "#14021226ec9b";

type GitSshRuntime = {
  logger: ReturnType<typeof resolveLogger>;
  verbose: boolean;
};

type GitSshAuthState = {
  identity: unknown;
  remoteAddress: string;
  remoteUser: string;
  username: string;
};

function validateCreateGitSshServerOptions(options: CreateGitSshServerOptions) {
  if (!options || typeof options.authenticate !== "function") {
    throw new TypeError(
      "createGitSshServer() requires an authenticate() function.",
    );
  }
  if (!options || typeof options.resolveRepository !== "function") {
    throw new TypeError(
      "createGitSshServer() requires a resolveRepository() function.",
    );
  }
  if (!Array.isArray(options.hostKeys) || !options.hostKeys.length) {
    throw new TypeError("createGitSshServer() requires at least one host key.");
  }
}

function createGitSshRuntime(
  options: CreateGitSshServerOptions,
): GitSshRuntime {
  logPackageInitialized({
      adapter: options.loggerAdapter,
      fallback: "console",
      group: buildGitHostLogGroup("ssh"),
      logger: options.logger,
      source: GIT_HOST_PACKAGE_NAME,
  });
  return {
    logger: resolveLogger(options.logger, options.loggerAdapter),
    verbose: options.verbose === true,
  };
}

export { createGitSshRuntime, validateCreateGitSshServerOptions };
export type { GitSshAuthState, GitSshRuntime };
