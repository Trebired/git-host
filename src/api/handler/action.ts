import { GitHostError } from "#ebw9yuqcyi9w";
import type { CreateGitApiHandlerOptions } from "#1mbdfxwwqqpa";
import { isTruthy, text } from "#sy81xkgkmoa0";
import { parsePositiveInt } from "./response.js";
import { parseGitApiRoute } from "./route.js";

async function runGitApiAction(
  options: CreateGitApiHandlerOptions,
  route: ReturnType<typeof parseGitApiRoute>,
  repositoryId: string,
  searchParams: URLSearchParams,
) {
  if (!route) throw new GitHostError("git_command_failed", "API route is required.");

  switch (route.action) {
    case "summary":
      return await options.gitHost.readSummary(repositoryId, {
        commitLimit: parsePositiveInt(searchParams.get("commitLimit"), "commitLimit"),
      });
    case "branches":
      return await options.gitHost.listBranches(repositoryId);
    case "commits":
      return await options.gitHost.listCommits(repositoryId, {
        limit: parsePositiveInt(searchParams.get("limit"), "limit"),
        path: text(searchParams.get("path")),
        ref: text(searchParams.get("ref")),
      });
    case "commit":
      return await options.gitHost.readCommit(repositoryId, route.commitRef);
    case "tags":
      return await options.gitHost.listTags(repositoryId);
    case "tag":
      return await options.gitHost.readTag(repositoryId, route.tagName);
    case "tree":
      return await options.gitHost.listTree(repositoryId, buildTreeOptions(searchParams));
    case "blame": {
      return await options.gitHost.readBlame(repositoryId, {
        path: requireSearchPath(searchParams, "blame"),
        ref: text(searchParams.get("ref")),
      });
    }
    case "search": {
      return await options.gitHost.search(repositoryId, buildSearchOptions(searchParams));
    }
    case "archive":
      return await options.gitHost.readArchive(repositoryId, buildArchiveOptions(searchParams));
    case "linguist":
      return await options.gitHost.readLinguist(repositoryId, {
        ref: text(searchParams.get("ref")),
      });
    case "blob": {
      return await options.gitHost.readBlob(repositoryId, {
        path: requireSearchPath(searchParams, "blob"),
        ref: text(searchParams.get("ref")),
      });
    }
    case "diff": {
      return await options.gitHost.diff(repositoryId, buildDiffOptions(searchParams));
    }
    default:
      throw new GitHostError("git_command_failed", "Unsupported Git API action.");
  }
}

function buildTreeOptions(searchParams: URLSearchParams) {
  return {
    icons: isTruthy(searchParams.get("icons")),
    linguist: isTruthy(searchParams.get("linguist")),
    path: text(searchParams.get("path")),
    recursive: isTruthy(searchParams.get("recursive")),
    ref: text(searchParams.get("ref")),
  };
}

function buildSearchOptions(searchParams: URLSearchParams) {
  const query = text(searchParams.get("query"));
  if (!query) throw new GitHostError("git_command_failed", "query is required.");
  return {
    caseSensitive: searchParams.has("caseSensitive") ? isTruthy(searchParams.get("caseSensitive")) : undefined,
    limit: parsePositiveInt(searchParams.get("limit"), "limit"),
    path: text(searchParams.get("path")),
    query,
    ref: text(searchParams.get("ref")),
    regexp: searchParams.has("regexp") ? isTruthy(searchParams.get("regexp")) : undefined,
  };
}

function buildArchiveOptions(searchParams: URLSearchParams) {
  return {
    format: text(searchParams.get("format")) as any,
    prefix: text(searchParams.get("prefix")),
    ref: text(searchParams.get("ref")),
  };
}

function buildDiffOptions(searchParams: URLSearchParams) {
  const baseRef = text(searchParams.get("baseRef"));
  const headRef = text(searchParams.get("headRef"));
  if (!baseRef || !headRef) throw new GitHostError("git_command_failed", "baseRef and headRef are required.");
  return {
    baseRef,
    headRef,
    path: text(searchParams.get("path")),
  };
}

function requireSearchPath(searchParams: URLSearchParams, action: "blame" | "blob"): string {
  const value = text(searchParams.get("path"));
  if (value) return value;
  throw new GitHostError("invalid_repository_path", `${action} path is required.`);
}

export { runGitApiAction };
