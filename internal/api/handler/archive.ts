import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  CreateGitApiHandlerOptions,
  CreateGitForgeApiHandlerOptions,
  GitArchive,
  GitArchiveDownload,
  GitArchiveMetadata,
  GitApiResource,
  GitForge,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetDownload,
  GitForgeReleaseAssetLink,
  GitHost,
  GitTagDetail,
  GitTagSummary,
} from "#1mbdfxwwqqpa";

function isArchiveDownloadAction(action: GitApiResource | string): action is "tarball" | "zipball" {
  return action === "tarball" || action === "zipball";
}

function quoteHttpFileName(value: string): string {
  return String(value || "").replace(/["\\]/g, "_");
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
    res.setHeader("content-disposition", `attachment; filename="${quoteHttpFileName(fileName)}"`);
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
  const metadata = "metadata" in input.archive ? input.archive.metadata : input.archive;
  const fileName = input.fileName || metadata.file_name;

  if ("redirect_url" in input.archive && input.archive.redirect_url) {
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

  if ("stream" in input.archive) {
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

function normalizeReleaseAssetLink(asset: GitForgeReleaseAsset, href: string): GitForgeReleaseAssetLink {
  return {
    asset_id: asset.id,
    content_type: asset.content_type,
    file_name: asset.name,
    href,
    size: asset.size == null ? null : Number(asset.size) || 0,
  };
}

function applyReleaseAssetHeaders(
  res: ServerResponse,
  asset: GitForgeReleaseAssetLink | GitForgeReleaseAssetDownload,
  input: {
    fileName?: string;
  } = {},
) {
  const fileName = String(input.fileName || asset.file_name || "");
  const contentType = "content_type" in asset ? asset.content_type : undefined;
  if (contentType) {
    res.setHeader("content-type", contentType);
  }
  if (fileName) {
    res.setHeader("content-disposition", `attachment; filename="${quoteHttpFileName(fileName)}"`);
  }
  if (asset.size != null) {
    res.setHeader("content-length", String(asset.size));
  }
}

async function writeGitReleaseAssetResponse(
  req: IncomingMessage,
  res: ServerResponse,
  input: {
    asset: GitForgeReleaseAssetDownload | GitForgeReleaseAssetLink;
    fileName?: string;
    statusCode?: number;
  },
) {
  if ("redirect_url" in input.asset && input.asset.redirect_url) {
    res.statusCode = 302;
    res.setHeader("location", input.asset.redirect_url);
    res.end();
    return;
  }

  res.statusCode = Number(input.statusCode) || 200;
  applyReleaseAssetHeaders(res, input.asset, { fileName: input.fileName });

  if (String(req.method || "GET").toUpperCase() === "HEAD") {
    res.end();
    return;
  }

  if ("stream" in input.asset && input.asset.stream) {
    input.asset.stream.on("error", (error) => {
      res.destroy(error instanceof Error ? error : new Error(String(error)));
    });
    input.asset.stream.pipe(res);
    return;
  }

  if ("content" in input.asset && typeof input.asset.content === "string" && input.asset.encoding) {
    res.end(Buffer.from(input.asset.content, input.asset.encoding));
    return;
  }

  res.end();
}

async function writeReleaseAssetDownload(
  req: IncomingMessage,
  res: ServerResponse,
  forge: GitForge,
  input: {
    assetId: string;
    fileName?: string;
    releaseId: string;
    repositoryId: string;
    repositoryKey?: string;
  },
) {
  const asset = String(req.method || "GET").toUpperCase() === "HEAD"
    ? await forge.resolveReleaseAssetLink(input.repositoryId, input.releaseId, input.assetId, {
      repositoryKey: input.repositoryKey,
    })
    : await forge.openReleaseAsset(input.repositoryId, input.releaseId, input.assetId, {
      repositoryKey: input.repositoryKey,
    });
  await writeGitReleaseAssetResponse(req, res, {
    asset,
    fileName: input.fileName,
  });
}

function attachTagSourceArchives<TTag extends GitTagDetail | GitTagSummary>(
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

async function attachReleaseAssetDownloads(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath" | "forge">,
  repositoryId: string,
  repositoryKey: string,
  release: GitForgeRelease,
): Promise<GitForgeRelease> {
  const releaseAssets = Array.isArray(release.assets) ? release.assets : [];
  const assets = await Promise.all(releaseAssets.map(async (asset) => {
    const existingHref = String(asset.download?.href || asset.download_url || "");
    const link = existingHref
      ? normalizeReleaseAssetLink(asset, existingHref)
      : await options.forge.resolveReleaseAssetLink(repositoryId, release.id, asset.id, { repositoryKey });
    return {
      ...asset,
      download: link,
      download_url: link.href,
    };
  }));
  return {
    ...release,
    assets,
  };
}

async function attachReleaseSourceArchives(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath" | "forge" | "gitHost">,
  repositoryId: string,
  repositoryKey: string,
  release: GitForgeRelease,
): Promise<GitForgeRelease> {
  await options.gitHost.resolveArchive(repositoryId, {
    format: "zip",
    ref: release.tag_name,
    repositoryKey,
  });

  return await attachReleaseAssetDownloads(options, repositoryId, repositoryKey, {
    ...release,
    source_archives: options.gitHost.resolveArchiveLinks(repositoryKey, {
      basePath: options.basePath,
      ref: release.tag_name,
      repositoryId,
    }),
  });
}

async function enrichRepositoryDataWithArchives(
  options: Pick<CreateGitApiHandlerOptions, "basePath" | "gitHost">,
  route: {
    action: string;
    repositoryId?: string;
    repositoryKey: string;
  },
  data: unknown,
) {
  if (route.action === "tag" && data && typeof data === "object") {
    return attachTagSourceArchives(options.gitHost, String(route.repositoryId || route.repositoryKey), route.repositoryKey, options.basePath, data as GitTagDetail);
  }
  if (route.action === "tags" && Array.isArray(data)) {
    return data.map((tag) => attachTagSourceArchives(options.gitHost, String(route.repositoryId || route.repositoryKey), route.repositoryKey, options.basePath, tag as GitTagSummary));
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
