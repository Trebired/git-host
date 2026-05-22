import type { GitApiResource } from "../../types.js";
import { text } from "../../utils/text.js";

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

function parseGitApiRoute(pathnameInput: unknown, basePathInput: unknown) {
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

  const action = text(segments[2]) as GitApiResource | "unknown";
  if (action === "summary" || action === "branches" || action === "tree" || action === "blob" || action === "diff") {
    if (segments.length !== 3) return null;
    return { action, repositoryKey };
  }

  if (action === "commits") {
    if (segments.length === 3) return { action, repositoryKey };
    if (segments.length === 4) {
      const commitRef = decodeRouteSegment(segments[3] || "");
      if (!commitRef) return null;
      return { action: "commit" as const, commitRef, repositoryKey };
    }
  }

  return null;
}

export { parseGitApiRoute };
