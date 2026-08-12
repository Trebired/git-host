import fs from "node:fs";

import type { GitForgeBubblewrapSandboxOptions, GitForgeLocalRunnerChildSpec } from "#14021226ec9b";

const DEFAULT_SYSTEM_PATHS = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc"];

function roBindArgs(paths: string[]) {
  return paths.flatMap((entry) => (fs.existsSync(entry) ? ["--ro-bind", entry, entry] : []));
}

function bindArgs(paths: string[]) {
  return paths.flatMap((entry) => ["--bind", entry, entry]);
}

function buildBubblewrapArgs(child: GitForgeLocalRunnerChildSpec, options: GitForgeBubblewrapSandboxOptions) {
  const systemPaths = options.systemPaths || DEFAULT_SYSTEM_PATHS;
  const workspace = child.cwd || process.cwd();
  return [
    "--unshare-all",
    ...(options.allowNetwork ? ["--share-net"] : []),
    "--die-with-parent",
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    ...roBindArgs(systemPaths),
    ...roBindArgs(options.roBind || []),
    "--bind", workspace, workspace,
    ...bindArgs(options.bind || []),
    "--chdir", workspace,
    "--",
    child.command,
    ...child.args,
  ];
}

function createBubblewrapSandbox(options: GitForgeBubblewrapSandboxOptions = {}) {
  const bwrapPath = options.bwrapPath || "bwrap";
  return function beforeSpawn(child: GitForgeLocalRunnerChildSpec): GitForgeLocalRunnerChildSpec {
    return {
      ...child,
      args: buildBubblewrapArgs(child, options),
      command: bwrapPath,
    };
  };
}

export {
  createBubblewrapSandbox,
};
