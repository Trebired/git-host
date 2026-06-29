import type { IncomingMessage } from "node:http";

import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  CancelGitForgeWorkflowRunInput,
  CreateGitForgeApiHandlerOptions,
  GitForgeActivityFilters,
  GitForgeActor,
  GitForgeOperation,
  GitForgeRelease,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunEventFilters,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { runGitApiAction } from "#t13y2bx0ygbf";
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
    case "action_run_events":
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
    case "action_run_events":
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

async function runForgeAction(
  options: CreateGitForgeApiHandlerOptions,
  route: GitForgeApiRoute,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
) {
  switch (route.action) {
    case "actions":
      return await runWorkflowCollectionAction(options, repositoryId, actor, body, searchParams);
    case "action":
      return await runWorkflowAction(options, repositoryId, route.workflowId, actor, body);
    case "action_runs":
      return await runWorkflowRunCollectionAction(options, repositoryId, actor, body, searchParams);
    case "action_run":
      return await options.forge.readWorkflowRun(repositoryId, route.runId);
    case "action_run_steps":
      return await options.forge.listWorkflowRunSteps(repositoryId, route.runId);
    case "action_run_events":
      return await options.forge.listWorkflowRunEvents(repositoryId, route.runId, readWorkflowRunEventFilters(searchParams));
    case "action_run_cancel":
      return await options.forge.cancelWorkflowRun(repositoryId, route.runId, {
        actor: actor as GitForgeActor,
      } satisfies CancelGitForgeWorkflowRunInput);
    case "overview":
      return await options.forge.readOverview(repositoryId, { actorId: actor?.id });
    case "social":
      return await options.forge.readSocialState(repositoryId, { actorId: actor?.id });
    case "stars":
      return await runStarAction(options, repositoryId, actor, body);
    case "watch":
      return await runWatchAction(options, repositoryId, actor, body);
    case "releases":
      return await runReleaseCollectionAction(options, route, repositoryId, actor, body);
    case "release":
      return await runReleaseAction(options, route, repositoryId, actor, body);
    case "forks":
      return await runForkCollectionAction(options, repositoryId, actor, body);
    case "fork_sync":
      return await options.forge.syncFork(route.forkId, {
        actor: actor as GitForgeActor,
        strategy: text(body.strategy) === "merge" ? "merge" : undefined,
      });
    case "activity":
      return await options.forge.listActivity(repositoryId, readActivityFilters(searchParams));
    default:
      return await runGitApiAction({ gitHost: options.gitHost } as any, route as any, repositoryId, new URLSearchParams());
  }
}

function readActivityFilters(searchParams: URLSearchParams): GitForgeActivityFilters {
  const kind = text(searchParams.get("kind"));
  const source = text(searchParams.get("source"));
  return {
    actor: text(searchParams.get("actor")),
    createdAfter: text(searchParams.get("createdAfter")),
    createdBefore: text(searchParams.get("createdBefore")),
    ...(kind ? { kind: kind.split(",").map((entry) => text(entry)).filter(Boolean) } : {}),
    ...(source ? { source: source.split(",").map((entry) => text(entry)).filter(Boolean) } : {}),
  };
}

function readWorkflowFilters(searchParams: URLSearchParams): GitForgeWorkflowFilters {
  const trigger = text(searchParams.get("trigger"));
  return {
    enabled: searchParams.has("enabled") ? text(searchParams.get("enabled")) === "true" : undefined,
    query: text(searchParams.get("query")),
    ...(trigger ? { trigger: trigger.split(",").map((entry) => text(entry)).filter(Boolean) } : {}),
  };
}

function readWorkflowRunFilters(searchParams: URLSearchParams): GitForgeWorkflowRunFilters {
  const status = text(searchParams.get("status"));
  const triggerKind = text(searchParams.get("triggerKind"));
  return {
    actor: text(searchParams.get("actor")),
    branch: text(searchParams.get("branch")),
    createdAfter: text(searchParams.get("createdAfter")),
    createdBefore: text(searchParams.get("createdBefore")),
    query: text(searchParams.get("query")),
    ref: text(searchParams.get("ref")),
    ...(status ? { status: status.split(",").map((entry) => text(entry)).filter(Boolean) as GitForgeWorkflowRunFilters["status"] } : {}),
    ...(triggerKind ? { triggerKind: triggerKind.split(",").map((entry) => text(entry)).filter(Boolean) as GitForgeWorkflowRunFilters["triggerKind"] } : {}),
    workflowId: text(searchParams.get("workflowId")),
  };
}

function readWorkflowRunEventFilters(searchParams: URLSearchParams): GitForgeWorkflowRunEventFilters {
  return {
    afterSequence: searchParams.has("afterSequence") ? Number(searchParams.get("afterSequence")) || 0 : undefined,
    limit: searchParams.has("limit") ? Number(searchParams.get("limit")) || undefined : undefined,
  };
}

function isForgeReleasePayload(value: unknown): value is GitForgeRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<GitForgeRelease>;
  return typeof release.id === "string"
    && typeof release.tag_name === "string"
    && Array.isArray(release.assets);
}

async function runStarAction(
  options: CreateGitForgeApiHandlerOptions,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
) {
  return body._method === "DELETE"
    ? await options.forge.unstarRepository(repositoryId, { actor: actor as GitForgeActor })
    : await options.forge.starRepository(repositoryId, { actor: actor as GitForgeActor });
}

async function runWatchAction(
  options: CreateGitForgeApiHandlerOptions,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
) {
  return body._method === "DELETE"
    ? await options.forge.unwatchRepository(repositoryId, { actor: actor as GitForgeActor })
    : await options.forge.watchRepository(repositoryId, { actor: actor as GitForgeActor });
}

async function runReleaseCollectionAction(
  options: CreateGitForgeApiHandlerOptions,
  route: GitForgeApiRoute,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
) {
  if (route.action !== "releases" || body._method !== "POST") {
    return await options.forge.listReleases(repositoryId);
  }
  return await options.forge.createRelease(repositoryId, {
    actor: actor as GitForgeActor,
    assets: Array.isArray(body.assets) ? body.assets as any[] : undefined,
    createTag: buildCreateTagInput(body.createTag),
    draft: body.draft === true,
    existingTagName: text(body.existingTagName),
    notes: text(body.notes),
    prerelease: body.prerelease === true,
    publishedAt: body.publishedAt === null ? null : text(body.publishedAt),
    title: text(body.title),
  });
}

async function runReleaseAction(
  options: CreateGitForgeApiHandlerOptions,
  route: GitForgeApiRoute,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
) {
  if (route.action !== "release") {
    throw new GitHostError("git_command_failed", "release route is required.");
  }
  if (body._method === "PATCH") {
    return await options.forge.updateRelease(repositoryId, route.releaseId, {
      actor: actor as GitForgeActor,
      assets: Array.isArray(body.assets) ? body.assets as any[] : undefined,
      draft: body.draft === true,
      notes: text(body.notes),
      prerelease: body.prerelease === true,
      publishedAt: body.publishedAt === null ? null : (body.publishedAt === undefined ? undefined : text(body.publishedAt)),
      title: body.title === undefined ? undefined : text(body.title),
    });
  }
  if (body._method === "DELETE") {
    await options.forge.deleteRelease(repositoryId, route.releaseId, {
      actor: actor as GitForgeActor,
      deleteTag: body.deleteTag === true,
    });
    return { deleted: true, release_id: route.releaseId };
  }
  return await options.forge.readRelease(repositoryId, route.releaseId);
}

async function runForkCollectionAction(
  options: CreateGitForgeApiHandlerOptions,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
) {
  if (body._method === "POST") {
    return await options.forge.createFork(repositoryId, { actor: actor as GitForgeActor });
  }
  return await options.forge.listForks(repositoryId);
}

async function runWorkflowCollectionAction(
  options: CreateGitForgeApiHandlerOptions,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
) {
  void actor;
  void body;
  return await options.forge.listWorkflows(repositoryId, readWorkflowFilters(searchParams));
}

async function runWorkflowAction(
  options: CreateGitForgeApiHandlerOptions,
  repositoryId: string,
  workflowId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
) {
  void actor;
  void body;
  return await options.forge.readWorkflow(repositoryId, workflowId);
}

async function runWorkflowRunCollectionAction(
  options: CreateGitForgeApiHandlerOptions,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
) {
  if (body._method === "POST") {
    return await options.forge.runWorkflow(repositoryId, text(body.workflowId), {
      actor: actor as GitForgeActor,
      branch: text(body.branch),
      commitHash: text(body.commitHash),
      ref: text(body.ref),
      triggerContext: body.triggerContext && typeof body.triggerContext === "object"
        ? body.triggerContext as Record<string, unknown>
        : undefined,
    });
  }
  return await options.forge.listWorkflowRuns(repositoryId, readWorkflowRunFilters(searchParams));
}

function buildCreateTagInput(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const createTag = value as Record<string, unknown>;
  return {
    annotatedMessage: text(createTag.annotatedMessage),
    name: text(createTag.name),
    targetRef: text(createTag.targetRef),
  };
}

function normalizeEnvRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const next = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [text(key), text(entry)] as const)
      .filter(([key, entry]) => key && entry),
  );
  return Object.keys(next).length ? next : undefined;
}

export {
  allowedMethodsForRoute,
  isForgeReleasePayload,
  readJsonBody,
  readActivityFilters,
  readWorkflowFilters,
  readWorkflowRunEventFilters,
  readWorkflowRunFilters,
  routeOperation,
  runForgeAction,
};
