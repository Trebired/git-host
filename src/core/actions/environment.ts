import type { GitForgeActionsEnvironmentOptions, GitForgeLocalRunnerOptions } from "#14021226ec9b";

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
