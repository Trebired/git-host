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
      return await options.gitHost.listTree(repositoryId, {
        icons: isTruthy(searchParams.get("icons")),
        linguist: isTruthy(searchParams.get("linguist")),
        path: text(searchParams.get("path")),
        recursive: isTruthy(searchParams.get("recursive")),
        ref: text(searchParams.get("ref")),
      });
    case "blame": {
      const blamePath = text(searchParams.get("path"));
      if (!blamePath) throw new GitHostError("invalid_repository_path", "blame path is required.");
      return await options.gitHost.readBlame(repositoryId, {
        path: blamePath,
        ref: text(searchParams.get("ref")),
      });
    }
    case "search": {
      const query = text(searchParams.get("query"));
      if (!query) throw new GitHostError("git_command_failed", "query is required.");
      return await options.gitHost.search(repositoryId, {
        caseSensitive: searchParams.has("caseSensitive") ? isTruthy(searchParams.get("caseSensitive")) : undefined,
        limit: parsePositiveInt(searchParams.get("limit"), "limit"),
        path: text(searchParams.get("path")),
        query,
        ref: text(searchParams.get("ref")),
        regexp: searchParams.has("regexp") ? isTruthy(searchParams.get("regexp")) : undefined,
      });
    }
    case "archive":
      return await options.gitHost.readArchive(repositoryId, {
        format: text(searchParams.get("format")) as any,
        prefix: text(searchParams.get("prefix")),
        ref: text(searchParams.get("ref")),
      });
    case "linguist":
      return await options.gitHost.readLinguist(repositoryId, {
        ref: text(searchParams.get("ref")),
      });
    case "blob": {
      const blobPath = text(searchParams.get("path"));
      if (!blobPath) throw new GitHostError("invalid_repository_path", "blob path is required.");
      return await options.gitHost.readBlob(repositoryId, {
        path: blobPath,
        ref: text(searchParams.get("ref")),
      });
    }
    case "diff": {
      const baseRef = text(searchParams.get("baseRef"));
      const headRef = text(searchParams.get("headRef"));
      if (!baseRef || !headRef) throw new GitHostError("git_command_failed", "baseRef and headRef are required.");
      return await options.gitHost.diff(repositoryId, {
        baseRef,
        headRef,
        path: text(searchParams.get("path")),
      });
    }
    default:
      throw new GitHostError("git_command_failed", "Unsupported Git API action.");
  }
}

export { runGitApiAction };
