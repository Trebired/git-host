import path from "node:path";

import { GitHostError } from "#ebw9yuqcyi9w";
import { text } from "./text.js";

function assertAbsoluteRepositoryPath(value: unknown): string {
  const repositoryPath = text(value);
  if (!repositoryPath || !path.isAbsolute(repositoryPath)) {
    throw new GitHostError("invalid_repository_path", "Repository paths must be absolute.", {
      path: repositoryPath,
    });
  }

  return path.resolve(repositoryPath);
}

function resolveRepositoryPath(options: { repositoryPath: string; rootDir: string }): string {
  const rootDir = path.resolve(text(options.rootDir));
  const rawRepositoryPath = normalizeRepositoryRelativePath(options.repositoryPath);

  if (!rawRepositoryPath) {
    throw new GitHostError("invalid_repository_path", "Repository path fragments must not be empty.");
  }

  const parts = rawRepositoryPath.split("/").filter(Boolean);
  const resolved = path.resolve(rootDir, ...parts);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new GitHostError("invalid_repository_path", "Repository path escaped the configured root.", {
      path: rawRepositoryPath,
      rootDir,
    });
  }

  return resolved;
}

function normalizeRepositoryRelativePath(value: unknown, options: { allowEmpty?: boolean } = {}): string {
  const rawRepositoryPath = text(value).replace(/\\/g, "/");
  if (!rawRepositoryPath) {
    if (options.allowEmpty === true) return "";
    throw new GitHostError("invalid_repository_path", "Repository path fragments must not be empty.");
  }
  if (path.posix.isAbsolute(rawRepositoryPath) || path.win32.isAbsolute(rawRepositoryPath)) {
    throw new GitHostError("invalid_repository_path", "Repository path fragments must be relative.", {
      path: rawRepositoryPath,
    });
  }

  const parts = rawRepositoryPath.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new GitHostError("invalid_repository_path", "Repository path fragments must not contain traversal segments.", {
      path: rawRepositoryPath,
    });
  }

  return parts.join("/");
}

export { assertAbsoluteRepositoryPath, normalizeRepositoryRelativePath, resolveRepositoryPath };
