import { spawnSync } from "node:child_process";

import { RELEASE_RUNNER_TARGETS } from "#4shewkcrh4gz";

for (const target of RELEASE_RUNNER_TARGETS) {
  const result = spawnSync("node", ["./scripts/build/runner.mjs", "--target", target], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
