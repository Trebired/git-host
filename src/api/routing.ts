import { text } from "#62f869522d1f";
import { normalizeHttpBasePath } from "#omwpz9vv7et8";

function decodeRouteSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseRepositoryRoute(pathnameInput: unknown, basePathInput: unknown) {
  const pathname = text(pathnameInput, "/");
  const basePath = normalizeHttpBasePath(basePathInput);
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
  normalizeHttpBasePath as normalizeBasePath,
  parseRepositoryRoute,
};
