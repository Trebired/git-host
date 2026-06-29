import { GitHostError } from "#ebw9yuqcyi9w";
import type {
  CreateGitForgeApiHandlerOptions,
  GitForgeRelease,
  GitForgeRepositoryOverview,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import {
  attachReleaseSourceArchives,
  enrichRepositoryDataWithArchives,
} from "#1uaqd3hnpa5k";
import { isForgeReleasePayload } from "./actions.js";
import type { GitForgeApiRoute } from "./route.js";

async function enrichForgeDataWithArchives(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath" | "forge" | "gitHost">,
  route: GitForgeApiRoute,
  repositoryId: string,
  data: unknown,
) {
  if (route.resource === "repository") {
    return await enrichRepositoryDataWithArchives({
      basePath: options.basePath,
      gitHost: options.gitHost,
    }, {
      ...route,
      repositoryId,
    } as any, data);
  }
  if (route.action === "release" && isForgeReleasePayload(data)) {
    return await attachReleaseWithNotFoundGuard(options, repositoryId, route.repositoryKey, data);
  }
  if (route.action === "releases" && Array.isArray(data)) {
    return await Promise.all(data.map(async (release) => {
      return await enrichRelease(options, route.repositoryKey, repositoryId, release);
    }));
  }
  if (route.action === "releases" && isForgeReleasePayload(data)) {
    return await enrichRelease(options, route.repositoryKey, repositoryId, data);
  }
  if (route.action === "overview" && data && typeof data === "object") {
    return await enrichOverview(options, route, repositoryId, data as GitForgeRepositoryOverview);
  }
  return data;
}

async function enrichRelease(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath" | "forge" | "gitHost">,
  repositoryKey: string,
  repositoryId: string,
  release: unknown,
) {
  return await enrichForgeDataWithArchives(options, {
    action: "release",
    releaseId: text((release as GitForgeRelease).id),
    repositoryKey,
    resource: "release",
  }, repositoryId, release);
}

async function enrichOverview(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath" | "forge" | "gitHost">,
  route: GitForgeApiRoute,
  repositoryId: string,
  overview: GitForgeRepositoryOverview,
) {
  return {
    ...overview,
    latest_release: overview.latest_release
      ? await enrichRelease(options, route.repositoryKey, repositoryId, overview.latest_release) as GitForgeRelease
      : null,
  };
}

async function attachReleaseWithNotFoundGuard(
  options: Pick<CreateGitForgeApiHandlerOptions, "basePath" | "forge" | "gitHost">,
  repositoryId: string,
  repositoryKey: string,
  release: GitForgeRelease,
) {
  try {
    return await attachReleaseSourceArchives(options, repositoryId, repositoryKey, release);
  } catch (error) {
    if (error instanceof GitHostError && error.code === "archive_ref_not_found") {
      throw new GitHostError(
        "release_tag_not_found",
        `Release "${release.id}" points at missing tag "${release.tag_name}" in repository "${repositoryId}".`,
        {
          releaseId: release.id,
          repositoryId,
          tag: release.tag_name,
        },
      );
    }
    throw error;
  }
}

export { enrichForgeDataWithArchives };
