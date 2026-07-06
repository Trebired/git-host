import { createArchiveServiceContext, createMaybeCleanupCache, createMetadataBuilder } from "./archive/context.js";
import type { CreateGitArchiveServiceOptions, GitArchiveService } from "./archive/context.js";
import { createResolveMethod, createResolveRequest } from "./archive/resolve.js";
import { createOpenMethod } from "./archive/open.js";
import { createReadMethod } from "./archive/read.js";
import { createResolveLinksMethod } from "./archive/links.js";
import { buildArchivePath, normalizeArchiveFormat } from "./archive/shared.js";

function createGitArchiveService(options: CreateGitArchiveServiceOptions): GitArchiveService {
  const context = createArchiveServiceContext(options);
  const maybeCleanupCache = createMaybeCleanupCache(context);
  const resolveRequest = createResolveRequest(context);
  const buildMetadata = createMetadataBuilder(context);
  const serviceRef: { current: GitArchiveService | null } = { current: null };
  const service: GitArchiveService = {
    open: createOpenMethod(context, maybeCleanupCache, resolveRequest, buildMetadata),
    read: createReadMethod(context, serviceRef),
    resolve: createResolveMethod(context, maybeCleanupCache, resolveRequest, buildMetadata),
    resolveLinks: createResolveLinksMethod(context),
  };
  serviceRef.current = service;
  return service;
}

export { buildArchivePath, createGitArchiveService, normalizeArchiveFormat };
export type { CreateGitArchiveServiceOptions, GitArchiveService };
