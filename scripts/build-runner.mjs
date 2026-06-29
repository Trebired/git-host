import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  hostRunnerTarget,
  runnerBinaryNameForTarget,
  runnerBuildConfigForTarget,
} from "./runner-targets.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedTarget = readTarget() || hostRunnerTarget();
const binaryName = runnerBinaryNameForTarget(requestedTarget);
const buildConfig = runnerBuildConfigForTarget(requestedTarget);
const outputPath = path.join(rootDir, "bin", binaryName);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const result = spawnSync("go", [
  "build",
  "-trimpath",
  "-ldflags",
  "-s -w",
  "-o",
  outputPath,
  "./go/cmd/git-host-actions-runner",
], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    CGO_ENABLED: "0",
    GOARCH: buildConfig.GOARCH,
    GOOS: buildConfig.GOOS,
  },
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`actions runner ready at ${outputPath}`);

function readTarget() {
  const index = process.argv.indexOf("--target");
  if (index < 0) return "";
  return String(process.argv[index + 1] || "").trim();
}
