import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  CancelGitForgeWorkflowRunInput,
  CreateGitForgeApiHandlerOptions,
  GitForgeActor,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { runGitApiAction } from "#t13y2bx0ygbf";
import type { GitForgeApiRoute } from "#e8559447ec5f";

import {
  readActivityFilters,
  readWorkflowFilters,
  readWorkflowRunArtifactFilters,
  readWorkflowRunEventFilters,
  readWorkflowRunFilters,
  readWorkflowRunJobFilters,
  readWorkflowRunStepFilters,
} from "./filters.js";

function normalizeStringMap(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [text(key), text(entry)] as const)
      .filter(([key, entry]) => key && entry),
  );
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
  if (route.action !== "release") throw new GitHostError("git_command_failed", "release route is required.");
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

async function runWorkflowRunCollectionAction(
  options: CreateGitForgeApiHandlerOptions,
  repositoryId: string,
  actor: GitForgeActor | null,
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
) {
  if (body._method !== "POST") {
    return await options.forge.listWorkflowRuns(repositoryId, readWorkflowRunFilters(searchParams));
  }
  return await options.forge.runWorkflow(repositoryId, text(body.workflowId), {
    actor: actor as GitForgeActor,
    branch: text(body.branch),
    commitHash: text(body.commitHash),
    env: normalizeStringMap(body.env),
    executionContext: body.executionContext && typeof body.executionContext === "object" ? body.executionContext as any : undefined,
    inputs: body.inputs && typeof body.inputs === "object" ? body.inputs as Record<string, boolean | string> : undefined,
    ref: text(body.ref),
    secrets: normalizeStringMap(body.secrets),
    triggerContext: body.triggerContext && typeof body.triggerContext === "object" ? body.triggerContext as Record<string, unknown> : undefined,
  });
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
      return await options.forge.listWorkflows(repositoryId, readWorkflowFilters(searchParams));
    case "action":
      return await options.forge.readWorkflow(repositoryId, route.workflowId);
    case "action_runs":
      return await runWorkflowRunCollectionAction(options, repositoryId, actor, body, searchParams);
    case "action_run":
      return await options.forge.readWorkflowRun(repositoryId, route.runId);
    case "action_run_artifacts":
      return await options.forge.listWorkflowRunArtifacts(repositoryId, route.runId, readWorkflowRunArtifactFilters(searchParams));
    case "action_run_steps":
      return await options.forge.listWorkflowRunSteps(repositoryId, route.runId, readWorkflowRunStepFilters(searchParams));
    case "action_run_jobs":
      return await options.forge.listWorkflowRunJobs(repositoryId, route.runId, readWorkflowRunJobFilters(searchParams));
    case "action_run_events":
      return await options.forge.listWorkflowRunEvents(repositoryId, route.runId, readWorkflowRunEventFilters(searchParams));
    case "action_run_cancel":
      return await options.forge.cancelWorkflowRun(repositoryId, route.runId, { actor: actor as GitForgeActor } satisfies CancelGitForgeWorkflowRunInput);
    case "overview":
      return await options.forge.readOverview(repositoryId, { actorId: actor?.id });
    case "social":
      return await options.forge.readSocialState(repositoryId, { actorId: actor?.id });
    case "stars":
      return body._method === "DELETE"
        ? await options.forge.unstarRepository(repositoryId, { actor: actor as GitForgeActor })
        : await options.forge.starRepository(repositoryId, { actor: actor as GitForgeActor });
    case "watch":
      return body._method === "DELETE"
        ? await options.forge.unwatchRepository(repositoryId, { actor: actor as GitForgeActor })
        : await options.forge.watchRepository(repositoryId, { actor: actor as GitForgeActor });
    case "releases":
      return await runReleaseCollectionAction(options, route, repositoryId, actor, body);
    case "release":
      return await runReleaseAction(options, route, repositoryId, actor, body);
    case "forks":
      return body._method === "POST"
        ? await options.forge.createFork(repositoryId, { actor: actor as GitForgeActor })
        : await options.forge.listForks(repositoryId);
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

export { runForgeAction };
