import { createHash } from "node:crypto";
import { IncomingMessage } from "node:http";
import fs from "node:fs";
import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitHttpHandlerOptions,
  GitHttpAuthenticationResult,
  GitHttpAuditEvent,
  GitHttpAuthorizationResult,
  GitHttpResolvedRepository,
  GitHttpService,
  GitRepositoryHandle,
} from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { emitAsyncEvent } from "#38ephfxhlt3m";
import { applyHeaders } from "#ha60kf0g69sv";
import { normalizeHttpBasePath } from "#omwpz9vv7et8";

function parseGitHttpRoute(pathnameInput: unknown, basePathInput: unknown) {
  const pathname = text(pathnameInput, "/");
  const basePath = normalizeHttpBasePath(basePathInput);
  if (basePath && !pathname.startsWith(`${basePath}/`) && pathname !== basePath) return null;

  const remainder = basePath ? pathname.slice(basePath.length).replace(/^\/+/, "") : pathname.replace(/^\/+/, "");
  if (!remainder) return null;

  const match = remainder.match(/^(.+\.git)(?:\/(.*))?$/);
  if (!match) return null;

  const repositoryPath = String(match[1] || "");
  const suffix = match[2] ? `/${match[2]}` : "";

  let repositoryKey = "";
  try {
    repositoryKey = decodeURIComponent(repositoryPath.slice(0, -4));
  } catch {
    return null;
  }

  return { repositoryKey, repositoryPath, suffix };
}

function requestedGitService(searchParams: URLSearchParams, suffixInput: unknown): GitHttpService {
  const queryService = text(searchParams.get("service"));
  if (queryService === "git-upload-pack" || queryService === "git-receive-pack") return queryService;
  return text(suffixInput).endsWith("/git-receive-pack") ? "git-receive-pack" : "git-upload-pack";
}

function parseBackendHeaders(raw: string) {
  const lines = String(raw || "").split(/\r?\n/).filter(Boolean);
  const headers: Array<[string, string]> = [];
  let statusCode = 200;

  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!name) continue;
    if (name.toLowerCase() === "status") {
      statusCode = Number(value.split(/\s+/)[0]) || 200;
      continue;
    }
    headers.push([name, value]);
  }

  return { headers, statusCode };
}

function sanitizeExportStem(value: unknown): string {
  return text(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "repo";
}

function ensureHttpExportPath(repository: GitRepositoryHandle, exportNameInput: unknown): string {
  const repositoryPath = path.resolve(repository.path);
  if (repositoryPath.endsWith(".git")) return repositoryPath;

  const digest = createHash("sha1").update(repository.id).update("\0").update(repositoryPath).digest("hex").slice(0, 12);
  const stem = sanitizeExportStem(exportNameInput || path.basename(repositoryPath));
  const exportPath = path.join(path.dirname(repositoryPath), `.${stem}-git-host-${digest}.git`);

  try {
    if (fs.existsSync(exportPath)) {
      const stat = fs.lstatSync(exportPath);
      if (stat.isSymbolicLink()) {
        const currentTarget = fs.readlinkSync(exportPath);
        const resolvedTarget = path.resolve(path.dirname(exportPath), currentTarget);
        if (resolvedTarget === repositoryPath) return exportPath;
      }
      throw new GitHostError("invalid_repository_path", "Repository export path is occupied by a different filesystem entry.", {
          exportPath,
          repositoryId: repository.id,
      });
    }

    fs.symlinkSync(repositoryPath, exportPath, "dir");
    return exportPath;
  } catch (error) {
    if (error instanceof GitHostError) throw error;
    throw new GitHostError("invalid_repository_path", "Failed to prepare the repository export path.", {
        exportPath,
        message: error instanceof Error ? error.message : String(error),
        repositoryId: repository.id,
    });
  }
}

const applyAuthorizationHeaders = applyHeaders;

function normalizeAuthenticationResult(value: GitHttpAuthenticationResult | undefined) {
  if (value == null) return { identity: undefined, remoteUser: "anonymous" };
  return { identity: value.identity, remoteUser: text(value.remoteUser, "anonymous") };
}

function authorizationAllowed(value: GitHttpAuthorizationResult | undefined) {
  if (value == null) return { allowed: true, remoteUser: "", status: 200, message: "" };
  if (typeof value === "boolean") return { allowed: value, remoteUser: "", status: value ? 200 : 403, message: "" };

  return {
    allowed: value.allowed === true,
    headers: value.headers,
    message: text(value.message),
    remoteUser: text(value.remoteUser, "anonymous"),
    status: Number(value.status) || (value.allowed === true ? 200 : 403),
  };
}

function emitHttpAuditEvent(onAuditEvent: ((event: GitHttpAuditEvent) => unknown) | undefined, event: GitHttpAuditEvent) {
  emitAsyncEvent(onAuditEvent, event);
}

async function resolveRepositoryResult(
  options: CreateGitHttpHandlerOptions,
  repositoryKey: string,
  request: IncomingMessage,
): Promise<GitHttpResolvedRepository|null> {
  const resolved = await options.resolveRepository(repositoryKey, request);
  if (!resolved) return null;
  if ("repository"in resolved) {
    return {
      exportName: resolved.exportName,
      repository: resolved.repository,
      repositoryKey: text(resolved.repositoryKey, repositoryKey),
    };
  }

  return {
    exportName: repositoryKey,
    repository: resolved,
    repositoryKey,
  };
}

export {
  applyAuthorizationHeaders,
  authorizationAllowed,
  emitHttpAuditEvent,
  ensureHttpExportPath,
  normalizeAuthenticationResult,
  parseBackendHeaders,
  parseGitHttpRoute,
  requestedGitService,
  resolveRepositoryResult,
};
