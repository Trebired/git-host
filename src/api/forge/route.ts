import { parseGitApiRoute } from "#xg7vpiql11ra";
import { text } from "#sy81xkgkmoa0";
import { decodeRouteSegment, parseRepositoryRoute } from "#glky615nezhr";

type GitForgeApiRoute =
  | {
      action: "activity" | "overview" | "social";
      repositoryKey: string;
      resource: "activity" | "repository" | "social";
    }
  | {
      action: "action";
      repositoryKey: string;
      resource: "action_workflow";
      workflowId: string;
    }
  | {
      action: "action_run";
      repositoryKey: string;
      resource: "action_run";
      runId: string;
    }
  | {
      action: "action_run_cancel";
      repositoryKey: string;
      resource: "action_run";
      runId: string;
    }
  | {
      action: "action_run_events";
      repositoryKey: string;
      resource: "action_run";
      runId: string;
    }
  | {
      action: "action_run_artifacts";
      repositoryKey: string;
      resource: "action_run";
      runId: string;
    }
  | {
      action: "action_run_jobs";
      repositoryKey: string;
      resource: "action_run";
      runId: string;
    }
  | {
      action: "action_run_steps";
      repositoryKey: string;
      resource: "action_run";
      runId: string;
    }
  | {
      action: "action_runs";
      repositoryKey: string;
      resource: "actions";
    }
  | {
      action: "actions";
      repositoryKey: string;
      resource: "actions";
    }
  | {
      action: "fork_sync";
      forkId: string;
      repositoryKey: string;
      resource: "fork";
    }
  | {
      action: "forks";
      repositoryKey: string;
      resource: "fork";
    }
  | {
      action: "asset";
      assetId: string;
      releaseId: string;
      repositoryKey: string;
      resource: "asset";
    }
  | {
      action: "release";
      releaseId: string;
      repositoryKey: string;
      resource: "release";
    }
  | {
      action: "releases";
      repositoryKey: string;
      resource: "release";
    }
  | {
      action: "stars" | "watch";
      repositoryKey: string;
      resource: "social";
    }
  | (ReturnType<typeof parseGitApiRoute> & {
      resource: "repository";
    });

function parseGitForgeApiRoute(pathnameInput: unknown, basePathInput: unknown): GitForgeApiRoute | null {
  const legacy = parseGitApiRoute(pathnameInput, basePathInput);
  if (legacy) {
    return {
      ...legacy,
      resource: "repository",
    };
  }

  const route = parseRepositoryRoute(pathnameInput, basePathInput);
  if (!route) return null;
  const { repositoryKey, segments } = route;
  const action = text(segments[2]);
  if (isOverviewAction(action)) return buildOverviewRoute(action, repositoryKey, segments.length);
  if (action === "actions") return buildActionsRoute(repositoryKey, segments);
  if (action === "releases") return segments.length === 3 ? buildCollectionRoute(action, repositoryKey, segments.length) : buildReleaseRoute(repositoryKey, segments);
  if (action === "forks") return segments.length === 3 ? buildCollectionRoute(action, repositoryKey, segments.length) : buildForkRoute(repositoryKey, segments);
  if (isCollectionAction(action)) return buildCollectionRoute(action, repositoryKey, segments.length);
  return null;
}

function isOverviewAction(action: string) {
  return action === "overview" || action === "social" || action === "activity";
}

function buildOverviewRoute(action: string, repositoryKey: string, length: number): GitForgeApiRoute | null {
  if (length !== 3) return null;
  return {
    action: action as "activity" | "overview" | "social",
    repositoryKey,
    resource: action === "activity" ? "activity" : (action === "social" ? "social" : "repository"),
  };
}

function isCollectionAction(action: string) {
  return action === "stars" || action === "watch";
}

function buildCollectionRoute(action: string, repositoryKey: string, length: number): GitForgeApiRoute | null {
  if (length !== 3) return null;
  if (action === "forks") return { action: "forks", repositoryKey, resource: "fork" };
  if (action === "releases") return { action: "releases", repositoryKey, resource: "release" };
  return { action: action as "stars" | "watch", repositoryKey, resource: "social" };
}

function buildReleaseRoute(repositoryKey: string, segments: string[]): GitForgeApiRoute | null {
  if (segments.length === 4) {
    const releaseId = decodeRouteSegment(segments[3] || "");
    return releaseId ? { action: "release", releaseId, repositoryKey, resource: "release" } : null;
  }
  if (segments.length === 6 && segments[4] === "assets") {
    const releaseId = decodeRouteSegment(segments[3] || "");
    const assetId = decodeRouteSegment(segments[5] || "");
    return releaseId && assetId
      ? { action: "asset", assetId, releaseId, repositoryKey, resource: "asset" }
      : null;
  }
  return null;
}

function buildForkRoute(repositoryKey: string, segments: string[]): GitForgeApiRoute | null {
  if (segments.length === 5 && segments[4] === "sync") {
    const forkId = decodeRouteSegment(segments[3] || "");
    return forkId ? { action: "fork_sync", forkId, repositoryKey, resource: "fork" } : null;
  }
  return null;
}

function buildActionsRoute(repositoryKey: string, segments: string[]): GitForgeApiRoute | null {
  if (segments.length === 3) {
    return { action: "actions", repositoryKey, resource: "actions" };
  }

  if (segments[3] === "runs") {
    if (segments.length === 4) {
      return { action: "action_runs", repositoryKey, resource: "actions" };
    }
    const runId = decodeRouteSegment(segments[4] || "");
    if (!runId) return null;
    if (segments.length === 5) {
      return { action: "action_run", repositoryKey, resource: "action_run", runId };
    }
    if (segments.length === 6 && segments[5] === "cancel") {
      return { action: "action_run_cancel", repositoryKey, resource: "action_run", runId };
    }
    if (segments.length === 6 && segments[5] === "events") {
      return { action: "action_run_events", repositoryKey, resource: "action_run", runId };
    }
    if (segments.length === 6 && segments[5] === "jobs") {
      return { action: "action_run_jobs", repositoryKey, resource: "action_run", runId };
    }
    if (segments.length === 6 && segments[5] === "artifacts") {
      return { action: "action_run_artifacts", repositoryKey, resource: "action_run", runId };
    }
    if (segments.length === 6 && segments[5] === "steps") {
      return { action: "action_run_steps", repositoryKey, resource: "action_run", runId };
    }
    return null;
  }

  if (segments.length === 4) {
    const workflowId = decodeRouteSegment(segments[3] || "");
    return workflowId ? { action: "action", repositoryKey, resource: "action_workflow", workflowId } : null;
  }
  return null;
}

export { parseGitForgeApiRoute };
export type { GitForgeApiRoute };
