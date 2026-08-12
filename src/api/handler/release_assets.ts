import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  CreateGitForgeApiHandlerOptions,
  GitForge,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetDownload,
  GitForgeReleaseAssetLink,
} from "#14021226ec9b";
import { quoteHttpFileName } from "./downloads.js";

function normalizeReleaseAssetLink(
  asset: GitForgeReleaseAsset,
  href: string,
): GitForgeReleaseAssetLink {
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
  const contentType = "content_type"in asset ? asset.content_type : undefined;
  if (contentType) {
    res.setHeader("content-type", contentType);
  }
  if (fileName) {
    res.setHeader(
      "content-disposition",
      `attachment; filename="${quoteHttpFileName(fileName)}"`,
    );
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
  if ("redirect_url"in input.asset && input.asset.redirect_url) {
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

  if ("stream"in input.asset && input.asset.stream) {
    input.asset.stream.on("error", (error) => {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
    });
    input.asset.stream.pipe(res);
    return;
  }

  if (
    "content"in input.asset &&
      typeof input.asset.content === "string" &&
      input.asset.encoding
  ) {
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
  const asset =
  String(req.method || "GET").toUpperCase() === "HEAD"
  ? await forge.resolveReleaseAssetLink(
    input.repositoryId,
    input.releaseId,
    input.assetId,
    {
      repositoryKey: input.repositoryKey,
    },
  )
  : await forge.openReleaseAsset(
    input.repositoryId,
    input.releaseId,
    input.assetId,
    {
      repositoryKey: input.repositoryKey,
    },
  );
  await writeGitReleaseAssetResponse(req, res, {
      asset,
      fileName: input.fileName,
  });
}

async function attachReleaseAssetDownloads(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath"|"forge">,
  repositoryId: string,
  repositoryKey: string,
  release: GitForgeRelease,
): Promise<GitForgeRelease> {
  const releaseAssets = Array.isArray(release.assets) ? release.assets : [];
  const assets = await Promise.all(
    releaseAssets.map(async(asset) => {
        const existingHref = String(
          asset.download?.href || asset.download_url || "",
        );
        const link = existingHref
        ? normalizeReleaseAssetLink(asset, existingHref)
        : await options.forge.resolveReleaseAssetLink(
          repositoryId,
          release.id,
          asset.id,
          { repositoryKey },
        );
        return {
          ...asset,
          download: link,
          download_url: link.href,
        };
    }),
  );
  return {
    ...release,
    assets,
  };
}

async function attachReleaseSourceArchives(
  options: Pick<
  CreateGitForgeApiHandlerOptions,
  "basePath" | "forge" | "gitHost"
  >,
  repositoryId: string,
  repositoryKey: string,
  release: GitForgeRelease,
): Promise<GitForgeRelease> {
  await options.gitHost.resolveArchive(repositoryId, {
      format: "zip",
      ref: release.tag_name,
      repositoryKey,
  });

  return await attachReleaseAssetDownloads(
    options,
    repositoryId,
    repositoryKey,
    {
      ...release,
      source_archives: options.gitHost.resolveArchiveLinks(repositoryKey, {
          basePath: options.basePath,
          ref: release.tag_name,
          repositoryId,
      }),
    },
  );
}

export {
  applyReleaseAssetHeaders,
  attachReleaseSourceArchives,
  normalizeReleaseAssetLink,
  writeGitReleaseAssetResponse,
  writeReleaseAssetDownload,
};
