import type { GitApiClientHeaders, GitApiHeaderResolver } from "./types.js";

function normalizeBaseUrl(value: string): string {
  const next = String(value || "").trim().replace(/\/+$/g, "");
  if (!next) {
    throw new TypeError("createGitApiClient() requires a baseUrl.");
  }
  return next;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(String(value || ""));
}

function appendQuery(url: string, query: URLSearchParams | undefined): string {
  const suffix = query && String(query).trim();
  if (!suffix) return url;
  return `${url}?${suffix}`;
}

function buildQuery(values: Record<string, boolean | number | string | undefined>): URLSearchParams | undefined {
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(values)) {
    if (value == null) continue;
    if (typeof value === "string" && value === "") continue;
    query.set(name, typeof value === "boolean" ? String(value) : String(value));
  }

  return String(query) ? query : undefined;
}

async function resolveHeaders(
  resolver: GitApiHeaderResolver | undefined,
  input: {
    path: string;
    repositoryKey?: string;
  },
) {
  if (!resolver) return undefined;
  if (typeof resolver === "function") {
    return await resolver(input);
  }
  return resolver;
}

function mergeHeaders(
  left: GitApiClientHeaders | undefined,
  right: GitApiClientHeaders | undefined,
): GitApiClientHeaders | undefined {
  if (!left && !right) return undefined;
  return {
    ...(left || {}),
    ...(right || {}),
  };
}

export { appendQuery, buildQuery, encodePathSegment, mergeHeaders, normalizeBaseUrl, resolveHeaders };
