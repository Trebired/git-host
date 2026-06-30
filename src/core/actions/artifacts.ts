import fs from "node:fs";
import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type { GitForgeWorkflowRunArtifact } from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

type StoredArtifact = {
  fileCount: number;
  path: string;
  size: number;
};

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  const results: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile()) results.push(absolutePath);
    }
  }
  return results;
}

function toMatcher(pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function expandArtifactPathSpec(workspacePath: string, spec: string) {
  const normalizedSpec = text(spec).replace(/\\/g, "/");
  if (!normalizedSpec) return [];
  const absolute = path.resolve(workspacePath, normalizedSpec);
  if (!normalizedSpec.includes("*") && !normalizedSpec.includes("?")) {
    return fs.existsSync(absolute) ? [absolute] : [];
  }
  const matcher = toMatcher(normalizedSpec);
  const candidates = walkFiles(workspacePath)
    .map((entry) => ({
      absolutePath: entry,
      relativePath: path.relative(workspacePath, entry).replace(/\\/g, "/"),
    }));
  return candidates
    .filter((entry) => matcher.test(entry.relativePath))
    .map((entry) => entry.absolutePath);
}

function parseArtifactPathSpecs(input: string) {
  return text(input)
    .split(/\r?\n|,/)
    .map((entry) => text(entry).trim())
    .filter(Boolean);
}

function directorySize(root: string) {
  return walkFiles(root)
    .map((entry) => fs.statSync(entry).size)
    .reduce((total, value) => total + value, 0);
}

function copyArtifactEntry(sourcePath: string, destinationPath: string) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    return;
  }
  ensureDirectory(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

function artifactStoragePath(artifactsRoot: string, artifactName: string) {
  return path.join(artifactsRoot, encodeURIComponent(artifactName));
}

function uploadArtifact(input: {
  artifactName: string;
  artifactsRoot: string;
  pathSpec: string;
  workspacePath: string;
}): StoredArtifact {
  const specs = parseArtifactPathSpecs(input.pathSpec);
  const matches = Array.from(new Set(specs.flatMap((spec) => expandArtifactPathSpec(input.workspacePath, spec))));
  if (!matches.length) {
    throw new GitHostError("forge_actions_runner_failed", `Artifact "${input.artifactName}" did not match any files.`, {
      artifactName: input.artifactName,
      pathSpec: input.pathSpec,
    });
  }
  const destinationRoot = artifactStoragePath(input.artifactsRoot, input.artifactName);
  fs.rmSync(destinationRoot, { force: true, recursive: true });
  ensureDirectory(destinationRoot);
  const copied = new Set<string>();
  for (const match of matches) {
    const relativePath = path.relative(input.workspacePath, match);
    const nextDestination = path.join(destinationRoot, relativePath);
    if (copied.has(nextDestination)) continue;
    copied.add(nextDestination);
    copyArtifactEntry(match, nextDestination);
  }
  return {
    fileCount: walkFiles(destinationRoot).length,
    path: destinationRoot,
    size: directorySize(destinationRoot),
  };
}

function downloadArtifact(input: {
  artifact: GitForgeWorkflowRunArtifact;
  artifactsRoot: string;
  destinationPath: string;
  workspacePath: string;
}) {
  const sourceRoot = input.artifact.path || artifactStoragePath(input.artifactsRoot, input.artifact.name);
  if (!fs.existsSync(sourceRoot)) {
    throw new GitHostError("forge_actions_runner_failed", `Artifact "${input.artifact.name}" is missing from storage.`, {
      artifactId: input.artifact.id,
      artifactName: input.artifact.name,
    });
  }
  const destination = path.resolve(input.workspacePath, text(input.destinationPath, "."));
  ensureDirectory(destination);
  fs.cpSync(sourceRoot, destination, { force: true, recursive: true });
}

export {
  artifactStoragePath,
  downloadArtifact,
  uploadArtifact,
};
