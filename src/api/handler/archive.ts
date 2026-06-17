import type { IncomingMessage, ServerResponse } from "node:http";

import type { CreateGitApiHandlerOptions, GitArchiveMetadata, GitApiResource, GitHost, GitTagDetail, GitTagSummary } from "../../types.js";

function isArchiveDownloadAction(action: GitApiResource | string): action is "tarball" | "zipball" {
  return action === "tarball" || action === "zipball";
}

function applyArchiveHeaders(res: ServerResponse, metadata: GitArchiveMetadata) {
  res.setHeader("content-type", metadata.content_type);
  res.setHeader("content-disposition", `attachment; filename="${metadata.file_name}"`);
  res.setHeader("x-git-host-archive-cache", metadata.cache_status);
  res.setHeader("x-git-host-archive-commit", metadata.resolved_commit);
  if (metadata.size != null) {
    res.setHeader("content-length", String(metadata.size));
  }
}

async function writeArchiveDownload(
  req: IncomingMessage,
  res: ServerResponse,
  gitHost: GitHost,
  input: {
    ref: string;
    repositoryId: string;
    routeAction: "tarball" | "zipball";
  },
) {
  const format = input.routeAction === "zipball" ? "zip" : "tar.gz";
  if (String(req.method || "GET").toUpperCase() === "HEAD") {
    const metadata = await gitHost.resolveArchive(input.repositoryId, {
      format,
      ref: input.ref,
    });
    res.statusCode = 200;
    applyArchiveHeaders(res, metadata);
    res.end();
    return;
  }

  const download = await gitHost.openArchive(input.repositoryId, {
    format,
    ref: input.ref,
  });
  if (download.redirect_url) {
    res.statusCode = 302;
    res.setHeader("location", download.redirect_url);
    res.end();
    return;
  }

  res.statusCode = 200;
  applyArchiveHeaders(res, download.metadata);
  download.stream.on("error", (error) => {
    res.destroy(error instanceof Error ? error : new Error(String(error)));
  });
  download.stream.pipe(res);
}

function attachTagSourceArchives<TTag extends GitTagDetail | GitTagSummary>(
  gitHost: GitHost,
  repositoryKey: string,
  basePath: string | undefined,
  tag: TTag,
): TTag {
  return {
    ...tag,
    source_archives: gitHost.resolveArchiveLinks(repositoryKey, {
      basePath,
      ref: tag.name,
    }),
  };
}

async function enrichRepositoryDataWithArchives(
  options: Pick<CreateGitApiHandlerOptions, "basePath" | "gitHost">,
  route: {
    action: string;
    repositoryKey: string;
  },
  data: unknown,
) {
  if (route.action === "tag" && data && typeof data === "object") {
    return attachTagSourceArchives(options.gitHost, route.repositoryKey, options.basePath, data as GitTagDetail);
  }
  if (route.action === "tags" && Array.isArray(data)) {
    return data.map((tag) => attachTagSourceArchives(options.gitHost, route.repositoryKey, options.basePath, tag as GitTagSummary));
  }
  return data;
}

export { enrichRepositoryDataWithArchives, isArchiveDownloadAction, writeArchiveDownload };
