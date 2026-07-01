import fs from "node:fs";

import type { GitForgeBubblewrapSandboxOptions, GitForgeLocalRunnerChildSpec } from "#1mbdfxwwqqpa";

// System paths bound read-only so a shell and common tooling can run while the
// rest of the host filesystem stays invisible to the sandboxed step.
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

// Returns a `localRunner.beforeSpawn` hook that wraps each step in bubblewrap
// (`bwrap`). By default the step gets an isolated filesystem view (read-only
// system paths plus a writable job workspace), no network, and fresh
// pid/ipc/uts/user namespaces. Linux-only; requires `bwrap` on PATH.
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
