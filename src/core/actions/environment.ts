import type { GitForgeActionsEnvironmentOptions, GitForgeLocalRunnerOptions } from "#1mbdfxwwqqpa";

// Minimal set of variables that generic tooling (shells, git, common CLIs) needs
// to function. Everything else is opt-in so host process secrets never leak into
// workflow steps by default.
const POSIX_PASSTHROUGH = ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "TERM"];
const WINDOWS_PASSTHROUGH = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SystemDrive",
  "HOMEDRIVE",
  "HOMEPATH",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "COMSPEC",
  "LANG",
  "LC_ALL",
  "TZ",
  "TERM",
];

function defaultPassthroughKeys() {
  return process.platform === "win32" ? WINDOWS_PASSTHROUGH : POSIX_PASSTHROUGH;
}

function inheritKeys(keys: Iterable<string>) {
  const inherited: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) {
      inherited[key] = value;
    }
  }
  return inherited;
}

// Builds the clean base environment for a workflow step. By default only the
// documented passthrough allowlist (plus any caller additions and explicit
// `baseEnv`) is exposed; `inheritProcessEnv` restores full `process.env`
// inheritance for callers that depend on the historical behavior.
function buildStepBaseEnv(policy: GitForgeActionsEnvironmentOptions | undefined): Record<string, string> {
  const baseEnv = { ...(policy?.baseEnv || {}) };
  if (policy?.inheritProcessEnv) {
    return {
      ...(process.env as Record<string, string>),
      ...baseEnv,
    };
  }
  const allow = new Set([...defaultPassthroughKeys(), ...(policy?.passthrough || [])]);
  return {
    ...inheritKeys(allow),
    ...baseEnv,
  };
}

// True when the local runner would execute steps as root without any privilege
// drop or sandbox, which means workflow code runs as root on the host.
function runnerNeedsPrivilegeWarning(input: {
  localRunner: GitForgeLocalRunnerOptions | undefined;
  uid: number | null;
}) {
  if (input.uid !== 0) return false;
  const { localRunner } = input;
  const dropsPrivileges = localRunner?.uid !== undefined && localRunner.uid !== 0;
  const sandboxed = typeof localRunner?.beforeSpawn === "function";
  return !dropsPrivileges && !sandboxed;
}

export {
  buildStepBaseEnv,
  defaultPassthroughKeys,
  runnerNeedsPrivilegeWarning,
};
