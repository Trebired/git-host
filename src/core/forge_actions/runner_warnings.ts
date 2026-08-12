import type { CreateGitForgeActionsOptions } from "#14021226ec9b";
import { runnerNeedsPrivilegeWarning } from "#tda3gxsxcw11";

function warnForUnsafeRunnerOptions(
  options: CreateGitForgeActionsOptions | undefined,
  runner: unknown,
) {
  void runner;
  if (options?.environment?.inheritProcessEnv) {
    console.warn(
      "[git-host] actions.environment.inheritProcessEnv is enabled: the entire host process environment is exposed to every workflow step and is " +
        "not redacted. Only enable this for fully trusted workflows.",
    );
  }
  if (
    runnerNeedsPrivilegeWarning({
        localRunner: options?.localRunner,
        uid: typeof process.getuid === "function" ? process.getuid() : null,
    })
  ) {
    console.warn(
      "[git-host] the local Actions runner is executing as root with no actions.localRunner.uid drop or beforeSpawn sandbox: workflow steps run as " +
        "root on the host. Configure a uid/gid drop or a sandbox (see createBubblewrapSandbox), or only run trusted workflows.",
    );
  }
}

export { warnForUnsafeRunnerOptions };
