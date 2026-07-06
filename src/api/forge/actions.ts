import type { IncomingMessage } from "node:http";

import type {
  GitForgeOperation,
  GitForgeRelease,
} from "#1mbdfxwwqqpa";
import {
  readActivityFilters,
  readWorkflowFilters,
  readWorkflowRunArtifactFilters,
  readWorkflowRunEventFilters,
  readWorkflowRunFilters,
  readWorkflowRunJobFilters,
  readWorkflowRunStepFilters,
} from "./actions/filters.js";
import { runForgeAction } from "./actions/run.js";
import type { GitForgeApiRoute } from "./route.js";

function routeOperation(route: GitForgeApiRoute, method: string): GitForgeOperation {
  if ("resource" in route && route.resource === "repository" && !("releaseId" in route) && !("forkId" in route)) return "read";
  switch (route.action) {
    case "actions":
      return "read";
    case "action":
      return "read";
    case "action_runs":
      return method === "POST" ? "run" : "read";
    case "action_run_cancel":
      return "cancel";
    case "action_run":
    case "action_run_artifacts":
    case "action_run_events":
    case "action_run_jobs":
    case "action_run_steps":
    case "asset":
      return "read";
    case "stars":
      return method === "DELETE" ? "delete" : "create";
    case "watch":
      return "subscribe";
    case "releases":
      return method === "POST" ? "create" : "read";
    case "release":
      if (method === "PATCH") return "update";
      if (method === "DELETE") return "delete";
      return "read";
    case "forks":
      return method === "POST" ? "create" : "read";
    case "fork_sync":
      return "sync";
    default:
      return "read";
  }
}

function allowedMethodsForRoute(route: GitForgeApiRoute): string[] {
  switch (route.action) {
    case "actions":
      return ["GET", "HEAD"];
    case "action":
      return ["GET", "HEAD"];
    case "action_runs":
      return ["GET", "HEAD", "POST"];
    case "action_run":
    case "action_run_artifacts":
    case "action_run_events":
    case "action_run_jobs":
    case "action_run_steps":
      return ["GET", "HEAD"];
    case "action_run_cancel":
      return ["POST"];
    case "stars":
    case "watch":
      return ["DELETE", "POST"];
    case "releases":
    case "forks":
      return ["GET", "HEAD", "POST"];
    case "asset":
      return ["GET", "HEAD"];
    case "release":
      return ["DELETE", "GET", "HEAD", "PATCH"];
    case "fork_sync":
      return ["POST"];
    default:
      return ["GET", "HEAD"];
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return parsed && typeof parsed === "object" ? parsed : {};
}

function isForgeReleasePayload(value: unknown): value is GitForgeRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<GitForgeRelease>;
  return typeof release.id === "string"
    && typeof release.tag_name === "string"
    && Array.isArray(release.assets);
}

export {
  allowedMethodsForRoute,
  isForgeReleasePayload,
  readActivityFilters,
  readJsonBody,
  readWorkflowFilters,
  readWorkflowRunArtifactFilters,
  readWorkflowRunEventFilters,
  readWorkflowRunFilters,
  readWorkflowRunJobFilters,
  readWorkflowRunStepFilters,
  routeOperation,
  runForgeAction,
};
