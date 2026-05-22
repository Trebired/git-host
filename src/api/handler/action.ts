import { GitHostError } from "../../errors.js";
import type { CreateGitApiHandlerOptions } from "../../types.js";
import { isTruthy, text } from "../../utils/text.js";
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
      });
    case "commit":
      return await options.gitHost.readCommit(repositoryId, route.commitRef);
    case "tree":
      return await options.gitHost.listTree(repositoryId, {
        path: text(searchParams.get("path")),
        recursive: isTruthy(searchParams.get("recursive")),
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
      return await options.gitHost.diff(repositoryId, { baseRef, headRef });
    }
    default:
      throw new GitHostError("git_command_failed", "Unsupported Git API action.");
  }
}

export { runGitApiAction };
