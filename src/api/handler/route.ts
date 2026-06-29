import type { GitApiResource } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { decodeRouteSegment, parseRepositoryRoute } from "#glky615nezhr";

function parseGitApiRoute(pathnameInput: unknown, basePathInput: unknown) {
  const route = parseRepositoryRoute(pathnameInput, basePathInput);
  if (!route) return null;
  const { repositoryKey, segments } = route;
  const action = text(segments[2]) as GitApiResource | "unknown";
  if (isDirectRepositoryAction(action)) return segments.length === 3 ? { action, repositoryKey } : null;
  if (action === "tarball" || action === "zipball") {
    return parseArchiveRoute(action, repositoryKey, segments[3], segments.length);
  }
  if (action === "commits") return parseCommitRoute(repositoryKey, segments);
  if (action === "tags") return parseTagRoute(repositoryKey, segments);
  return null;
}

function isDirectRepositoryAction(action: GitApiResource | "unknown") {
  return action === "summary"
    || action === "branches"
    || action === "tree"
    || action === "blob"
    || action === "diff"
    || action === "linguist"
    || action === "blame"
    || action === "search"
    || action === "archive";
}

function parseArchiveRoute(action: "tarball" | "zipball", repositoryKey: string, value: string | undefined, length: number) {
  if (length !== 4) return null;
  const refName = decodeRouteSegment(value || "");
  return refName ? { action, refName, repositoryKey } : null;
}

function parseCommitRoute(repositoryKey: string, segments: string[]) {
  if (segments.length === 3) return { action: "commits" as const, repositoryKey };
  if (segments.length !== 4) return null;
  const commitRef = decodeRouteSegment(segments[3] || "");
  return commitRef ? { action: "commit" as const, commitRef, repositoryKey } : null;
}

function parseTagRoute(repositoryKey: string, segments: string[]) {
  if (segments.length === 3) return { action: "tags" as const, repositoryKey };
  if (segments.length !== 4) return null;
  const tagName = decodeRouteSegment(segments[3] || "");
  return tagName ? { action: "tag" as const, repositoryKey, tagName } : null;
}

export { parseGitApiRoute };
