import { parseGitApiRoute } from "#xg7vpiql11ra";
import { text } from "#sy81xkgkmoa0";

function normalizeBasePath(value: unknown): string {
  const next = text(value).replace(/\/+$/g, "");
  if (!next || next === "/") return "";
  return next.startsWith("/") ? next : `/${next}`;
}

function decodeRouteSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

type GitForgeApiRoute =
  | {
      action: "activity" | "overview" | "social";
      repositoryKey: string;
      resource: "activity" | "repository" | "social";
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

  const pathname = text(pathnameInput, "/");
  const basePath = normalizeBasePath(basePathInput);
  if (basePath && !pathname.startsWith(`${basePath}/`) && pathname !== basePath) return null;

  const remainder = basePath
    ? pathname.slice(basePath.length).replace(/^\/+/, "")
    : pathname.replace(/^\/+/, "");
  if (!remainder) return null;

  const segments = remainder.split("/").filter(Boolean);
  if (segments[0] !== "repositories" || segments.length < 3) return null;

  const repositoryKey = decodeRouteSegment(segments[1] || "");
  if (!repositoryKey) return null;

  const action = text(segments[2]);
  if ((action === "overview" || action === "social" || action === "activity") && segments.length === 3) {
    return {
      action: action as "activity" | "overview" | "social",
      repositoryKey,
      resource: action === "activity" ? "activity" : (action === "social" ? "social" : "repository"),
    };
  }

  if ((action === "stars" || action === "watch" || action === "releases" || action === "forks") && segments.length === 3) {
    if (action === "forks") {
      return {
        action: "forks",
        repositoryKey,
        resource: "fork",
      };
    }
    if (action === "releases") {
      return {
        action: "releases",
        repositoryKey,
        resource: "release",
      };
    }
    return {
      action: action as "stars" | "watch",
      repositoryKey,
      resource: "social",
    };
  }

  if (action === "releases" && segments.length === 4) {
    const releaseId = decodeRouteSegment(segments[3] || "");
    if (!releaseId) return null;
    return {
      action: "release",
      releaseId,
      repositoryKey,
      resource: "release",
    };
  }

  if (action === "releases" && segments.length === 6 && segments[4] === "assets") {
    const releaseId = decodeRouteSegment(segments[3] || "");
    const assetId = decodeRouteSegment(segments[5] || "");
    if (!releaseId || !assetId) return null;
    return {
      action: "asset",
      assetId,
      releaseId,
      repositoryKey,
      resource: "asset",
    };
  }

  if (action === "forks" && segments.length === 5 && segments[4] === "sync") {
    const forkId = decodeRouteSegment(segments[3] || "");
    if (!forkId) return null;
    return {
      action: "fork_sync",
      forkId,
      repositoryKey,
      resource: "fork",
    };
  }

  return null;
}

export { parseGitForgeApiRoute };
export type { GitForgeApiRoute };
