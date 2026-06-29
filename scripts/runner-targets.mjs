import fs from "node:fs";

const TARGET_RUNNER_NAMES = new Map([
  ["x86_64-unknown-linux-gnu", "git-host-actions-runner-linux-x64-gnu"],
  ["aarch64-unknown-linux-gnu", "git-host-actions-runner-linux-arm64-gnu"],
  ["x86_64-apple-darwin", "git-host-actions-runner-darwin-x64"],
  ["aarch64-apple-darwin", "git-host-actions-runner-darwin-arm64"],
]);

const RELEASE_RUNNER_TARGETS = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
];

function linuxLibcVariant() {
  const report = typeof process.report?.getReport === "function" ? process.report.getReport() : null;
  const header = report && typeof report === "object" ? report.header : null;
  if (header && header.glibcVersionRuntime) return "gnu";
  if (fs.existsSync("/etc/alpine-release")) return "musl";
  return "gnu";
}

function expectedHostRunnerName() {
  if (process.platform === "linux") {
    const libc = linuxLibcVariant();
    if (libc !== "gnu") return "";
    if (process.arch === "x64") return "git-host-actions-runner-linux-x64-gnu";
    if (process.arch === "arm64") return "git-host-actions-runner-linux-arm64-gnu";
    return "";
  }

  if (process.platform === "darwin") {
    if (process.arch === "x64") return "git-host-actions-runner-darwin-x64";
    if (process.arch === "arm64") return "git-host-actions-runner-darwin-arm64";
    return "";
  }

  return "";
}

function runnerBinaryNameForTarget(target) {
  const resolved = TARGET_RUNNER_NAMES.get(target);
  if (!resolved) throw new Error(`unsupported-runner-target: ${target}`);
  return resolved;
}

function runnerBuildConfigForTarget(target) {
  switch (target) {
    case "x86_64-unknown-linux-gnu":
      return { GOARCH: "amd64", GOOS: "linux" };
    case "aarch64-unknown-linux-gnu":
      return { GOARCH: "arm64", GOOS: "linux" };
    case "x86_64-apple-darwin":
      return { GOARCH: "amd64", GOOS: "darwin" };
    case "aarch64-apple-darwin":
      return { GOARCH: "arm64", GOOS: "darwin" };
    default:
      throw new Error(`unsupported-runner-target: ${target}`);
  }
}

function hostRunnerTarget() {
  if (process.platform === "linux") {
    if (linuxLibcVariant() !== "gnu") {
      throw new Error("unsupported-host-runner-target: linux musl is not part of the release matrix.");
    }
    if (process.arch === "x64") return "x86_64-unknown-linux-gnu";
    if (process.arch === "arm64") return "aarch64-unknown-linux-gnu";
  }

  if (process.platform === "darwin") {
    if (process.arch === "x64") return "x86_64-apple-darwin";
    if (process.arch === "arm64") return "aarch64-apple-darwin";
  }

  throw new Error(`unsupported-host-runner-target: ${process.platform}-${process.arch}`);
}

export {
  RELEASE_RUNNER_TARGETS,
  TARGET_RUNNER_NAMES,
  expectedHostRunnerName,
  hostRunnerTarget,
  runnerBinaryNameForTarget,
  runnerBuildConfigForTarget,
};
