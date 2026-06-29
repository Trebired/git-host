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

function parseRepositoryRoute(pathnameInput: unknown, basePathInput: unknown) {
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

  return { pathname, repositoryKey, segments };
}

export {
  decodeRouteSegment,
  normalizeBasePath,
  parseRepositoryRoute,
};
