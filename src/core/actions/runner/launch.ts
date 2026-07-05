import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GitHostError } from "#8974ac53d713";
import type { CreateGitForgeActionsOptions } from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

import type { RunnerLaunch } from "#hzv9f3wx9ez9";

const RUNNER_BINARY_NAMES = {
  "darwin-arm64": "git-host-actions-runner-darwin-arm64",
  "darwin-x64": "git-host-actions-runner-darwin-x64",
  "linux-arm64": "git-host-actions-runner-linux-arm64-gnu",
  "linux-x64": "git-host-actions-runner-linux-x64-gnu",
} satisfies Record<string, string>;

const RUNNER_BINARY_DIRECTORIES = ["runners", "bin"] as const;

let sourceCheckoutGoRunnerPath: string | null | undefined;

function findPackageRoot(startPath: string): string {
  let current = path.resolve(startPath);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new GitHostError("forge_actions_runner_not_found", "Unable to resolve the package root for the actions runner.");
}

function packagedRunnerCandidatePaths(binaryName: string): string[] {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return RUNNER_BINARY_DIRECTORIES.flatMap((directory) => [
    path.resolve(currentDir, `../../../../${directory}`, binaryName),
    path.resolve(process.cwd(), directory, binaryName),
  ]);
}

function resolvePackagedRunnerPath(options: CreateGitForgeActionsOptions | undefined): string | null {
  const explicit = text(options?.runnerBinaryPath);
  if (explicit) return explicit;

  const key = `${process.platform}-${process.arch}`;
  const binary = RUNNER_BINARY_NAMES[key as keyof typeof RUNNER_BINARY_NAMES];
  if (!binary) return null;

  for (const candidate of packagedRunnerCandidatePaths(binary)) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function resolveGoFallbackCommand(): { args: string[]; command: string; cwd?: string } | null {
  if (sourceCheckoutGoRunnerPath !== undefined) {
    return sourceCheckoutGoRunnerPath
      ? { args: [], command: sourceCheckoutGoRunnerPath }
      : null;
  }

  const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  const sourcePath = path.join(packageRoot, "go", "cmd", "git-host-actions-runner");
  if (!fs.existsSync(sourcePath)) {
    sourceCheckoutGoRunnerPath = null;
    return null;
  }

  const probe = spawnSync("go", ["version"], {
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    sourceCheckoutGoRunnerPath = null;
    return null;
  }

  const binaryDirectory = path.join(os.tmpdir(), "@trebired-git-host-actions-runner", `${process.platform}-${process.arch}`);
  const binaryPath = path.join(binaryDirectory, "git-host-actions-runner");
  fs.mkdirSync(binaryDirectory, { recursive: true });
  const build = spawnSync("go", ["build", "-o", binaryPath, "./go/cmd/git-host-actions-runner"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  if (build.status !== 0 || !fs.existsSync(binaryPath)) {
    sourceCheckoutGoRunnerPath = null;
    return null;
  }

  sourceCheckoutGoRunnerPath = binaryPath;
  return {
    args: [],
    command: binaryPath,
  };
}

function resolveRunnerLaunch(options: CreateGitForgeActionsOptions | undefined): RunnerLaunch {
  const packaged = resolvePackagedRunnerPath(options);
  if (packaged) {
    return {
      args: [],
      command: packaged,
      kind: "go",
    };
  }

  const goFallback = resolveGoFallbackCommand();
  if (goFallback) {
    return {
      ...goFallback,
      kind: "go",
    };
  }

  return {
    kind: "node",
  };
}

export { resolveRunnerLaunch };
