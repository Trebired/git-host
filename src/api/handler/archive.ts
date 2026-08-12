import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  CreateGitApiHandlerOptions,
  GitArchive,
  GitArchiveDownload,
  GitArchiveMetadata,
  GitApiResource,
  GitHost,
  GitTagDetail,
  GitTagSummary,
} from "#14021226ec9b";
import { quoteHttpFileName } from "./downloads.js";
import {
  applyReleaseAssetHeaders,
  attachReleaseSourceArchives,
  normalizeReleaseAssetLink,
  writeGitReleaseAssetResponse,
  writeReleaseAssetDownload,
} from "./release_assets.js";

function isArchiveDownloadAction(
  action: GitApiResource | string,
): action is "tarball" | "zipball" {
  return action === "tarball" || action === "zipball";
}

function applyArchiveHeaders(
  res: ServerResponse,
  metadata: GitArchiveMetadata,
  input: {
    fileName?: string;
  } = {},
) {
  const fileName = String(input.fileName || metadata.file_name || "");
  res.setHeader("content-type", metadata.content_type);
  if (fileName) {
    res.setHeader(
      "content-disposition",
      `attachment; filename="${quoteHttpFileName(fileName)}"`,
    );
  }
  res.setHeader("x-git-host-archive-cache", metadata.cache_status);
  res.setHeader("x-git-host-archive-commit", metadata.resolved_commit);
  if (metadata.size != null) {
    res.setHeader("content-length", String(metadata.size));
  }
}

async function writeGitArchiveResponse(
  req: IncomingMessage,
  res: ServerResponse,
  input: {
    archive: GitArchive | GitArchiveDownload;
    fileName?: string;
    statusCode?: number;
  },
) {
  const method = String(req.method || "GET").toUpperCase();
  const metadata =
  "metadata"in input.archive ? input.archive.metadata : input.archive;
  const fileName = input.fileName || metadata.file_name;

  if ("redirect_url"in input.archive && input.archive.redirect_url) {
    res.statusCode = 302;
    res.setHeader("location", input.archive.redirect_url);
    res.end();
    return;
  }

  res.statusCode = Number(input.statusCode) || 200;
  applyArchiveHeaders(res, metadata, { fileName });

  if (method === "HEAD") {
    res.end();
    return;
  }

  if ("stream"in input.archive) {
    input.archive.stream.on("error", (error) => {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
    });
    input.archive.stream.pipe(res);
    return;
  }

  res.end(Buffer.from(input.archive.content, input.archive.encoding));
}

async function writeArchiveDownload(
  req: IncomingMessage,
  res: ServerResponse,
  gitHost: GitHost,
  input: {
    fileName?: string;
    ref: string;
    repositoryId: string;
    repositoryKey?: string;
    rootDirectory?: string;
    routeAction: "tarball" | "zipball";
  },
) {
  const format = input.routeAction === "zipball" ? "zip" : "tar.gz";
  if (String(req.method || "GET").toUpperCase() === "HEAD") {
    const metadata = await gitHost.resolveArchive(input.repositoryId, {
        fileName: input.fileName,
        format,
        ref: input.ref,
        repositoryKey: input.repositoryKey,
        rootDirectory: input.rootDirectory,
    });
    res.statusCode = 200;
    applyArchiveHeaders(res, metadata, { fileName: input.fileName });
    res.end();
    return;
  }

  const download = await gitHost.openArchive(input.repositoryId, {
      fileName: input.fileName,
      format,
      ref: input.ref,
      repositoryKey: input.repositoryKey,
      rootDirectory: input.rootDirectory,
  });
  await writeGitArchiveResponse(req, res, {
      archive: download,
      fileName: input.fileName,
  });
}

function attachTagSourceArchives<TTag extends GitTagDetail|GitTagSummary>(
  gitHost: GitHost,
  repositoryId: string,
  repositoryKey: string,
  basePath: string | undefined,
  tag: TTag,
): TTag {
  return {
    ...tag,
    source_archives: gitHost.resolveArchiveLinks(repositoryKey, {
        basePath,
        ref: tag.name,
        repositoryId,
    }),
  };
}

async function enrichRepositoryDataWithArchives(
  options: Pick<CreateGitApiHandlerOptions, "basePath"|"gitHost">,
  route: {
    action: string;
    repositoryId?: string;
    repositoryKey: string;
  },
  data: unknown,
) {
  if (route.action === "tag" && data && typeof data === "object") {
    return attachTagSourceArchives(
      options.gitHost,
      String(route.repositoryId || route.repositoryKey),
      route.repositoryKey,
      options.basePath,
      data as GitTagDetail,
    );
  }
  if (route.action === "tags" && Array.isArray(data)) {
    return data.map((tag) =>
      attachTagSourceArchives(
        options.gitHost,
        String(route.repositoryId || route.repositoryKey),
        route.repositoryKey,
        options.basePath,
        tag as GitTagSummary,
      ),
    );
  }
  return data;
}

export {
  applyArchiveHeaders,
  applyReleaseAssetHeaders,
  enrichRepositoryDataWithArchives,
  isArchiveDownloadAction,
  normalizeReleaseAssetLink,
  writeArchiveDownload,
  writeGitArchiveResponse,
  writeGitReleaseAssetResponse,
  writeReleaseAssetDownload,
  attachReleaseSourceArchives,
};
