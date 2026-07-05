import type { IncomingMessage, ServerResponse } from "node:http";

import { result } from "@trebired/result";
import { GitHostError, isGitHostError } from "#ebw9yuqcyi9w";
import { text } from "#sy81xkgkmoa0";

function applyAuthorizationHeaders(res: ServerResponse, headers: Record<string, string> | undefined) {
  const nextHeaders = headers && typeof headers === "object" ? headers : {};
  for (const [name, value] of Object.entries(nextHeaders)) {
    if (!name || typeof value !== "string") continue;
    res.setHeader(name, value);
  }
}

function authorizationAllowed(value: boolean | {
  allowed: boolean;
  headers?: Record<string, string>;
  message?: string;
  status?: number;
} | undefined) {
  if (value == null) return { allowed: true, status: 200, message: "" };
  if (typeof value === "boolean") return { allowed: value, status: value ? 200 : 403, message: "" };

  return {
    allowed: value.allowed === true,
    headers: value.headers,
    message: text(value.message),
    status: Number(value.status) || (value.allowed === true ? 200 : 403),
  };
}

function parsePositiveInt(value: string | null, name: string): number | undefined {
  if (value == null || text(value) === "") return undefined;
  const next = Number(value);
  if (!Number.isInteger(next) || next <= 0) {
    throw new GitHostError("git_command_failed", `${name} must be a positive integer.`, { value });
  }
  return next;
}

function statusForError(error: unknown): number {
  if (isGitHostError(error)) {
    switch (error.code) {
      case "archive_format_not_supported":
      case "invalid_branch_name":
      case "invalid_repository_path":
        return 400;
      case "archive_access_denied":
        return 403;
      case "archive_generation_failed":
        return 500;
      case "archive_ref_not_found":
      case "release_tag_not_found":
      case "repository_not_found":
      case "forge_resource_not_found":
        return 404;
      case "repository_empty":
      case "repository_not_initialized":
      case "repository_clone_target_not_empty":
      case "forge_sync_conflict":
        return 409;
      case "forge_invalid_actor":
      case "forge_invalid_input":
        return 400;
      default:
        return 400;
    }
  }

  return 500;
}

function serializeError(error: unknown) {
  if (isGitHostError(error)) {
    return {
      ok: false,
      error: {
        code: error.code,
        details: error.details,
        message: error.message,
      },
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "internal_error",
      message: "Git API request failed.",
    },
  };
}

function withStructuredResult(status: number, payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  if (record.result) {
    return payload;
  }

  if (record.ok === true) {
    return {
      ...record,
      result: result.ok("Git host backend request completed.", {
        data: hasOwn(record, "data") ? (record.data ?? null) : null,
        details: collectResultDetails(record, ["action", "repository_id", "repository_key"]),
      }),
    };
  }

  if (record.ok === false) {
    const errorRecord = toRecord(record.error);
    const code = typeof errorRecord?.code === "string" ? errorRecord.code : "internal_error";
    const message = typeof errorRecord?.message === "string" ? errorRecord.message : "Git host backend request failed.";
    const details = toRecord(errorRecord?.details) ?? collectResultDetails(record, ["error"]);

    return {
      ...record,
      result: status >= 500
        ? result.internal(code, message, { details })
        : status === 404
          ? result.notFound(code, message, { details })
          : status === 409
            ? result.conflict(code, message, { details })
            : result.error(status, code, message, { details }),
    };
  }

  return payload;
}

function collectResultDetails(record: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  for (const key of keys) {
    if (hasOwn(record, key)) {
      details[key] = record[key];
    }
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function writeJson(req: IncomingMessage, res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (text(req.method).toUpperCase() === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify(withStructuredResult(status, payload), null, 2));
}

export { applyAuthorizationHeaders, authorizationAllowed, parsePositiveInt, serializeError, statusForError, writeJson };
