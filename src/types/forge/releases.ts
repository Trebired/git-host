import type { MaybePromise } from "#5a0e75b6bdb8";
import type { GitSourceArchiveLinks } from "#666a84ce027e";

import type { GitForgeActor } from "./activity.js";

type GitForgeReleaseAsset = {
  content_type?: string;
  download?: GitForgeReleaseAssetLink;
  download_url?: string;
  id: string;
  name: string;
  size?: number;
  storage_pointer?: string;
};

type GitForgeReleaseAssetLink = {
  asset_id: string;
  content_type?: string;
  file_name: string;
  href: string;
  size: number | null;
};

type GitForgeReleaseAssetDownload = {
  asset: GitForgeReleaseAsset;
  completed?: Promise<GitForgeReleaseAssetLink>;
  content?: string;
  content_type: string;
  encoding?: "base64";
  file_name: string;
  redirect_url?: string;
  size: number | null;
  stream?: NodeJS.ReadableStream;
};

type GitForgeRelease = {
  assets: GitForgeReleaseAsset[];
  author_id: string;
  created_at: string;
  draft: boolean;
  id: string;
  notes: string;
  prerelease: boolean;
  published_at: string | null;
  repository_id: string;
  source_archives?: GitSourceArchiveLinks;
  tag_name: string;
  target_ref: string;
  title: string;
  updated_at: string;
};

type CreateGitForgeReleaseInput = {
  actor: GitForgeActor;
  assets?: GitForgeReleaseAsset[];
  createTag?: {
    annotatedMessage?: string;
    name: string;
    targetRef?: string;
  };
  draft?: boolean;
  existingTagName?: string;
  notes?: string;
  prerelease?: boolean;
  publishedAt?: string | null;
  title?: string;
};

type UpdateGitForgeReleaseInput = {
  actor: GitForgeActor;
  assets?: GitForgeReleaseAsset[];
  draft?: boolean;
  notes?: string;
  prerelease?: boolean;
  publishedAt?: string | null;
  title?: string;
};

type DeleteGitForgeReleaseInput = {
  actor: GitForgeActor;
  deleteTag?: boolean;
};

type GitForgeReleaseAssetStore = {
  buildAssetDownloadUrl?: (input: {
    asset: GitForgeReleaseAsset;
    release: GitForgeRelease;
    repositoryId: string;
    repositoryKey?: string;
  }) => string | null | undefined;
  normalizeAssets?: (
    repositoryId: string,
    assets: GitForgeReleaseAsset[],
  ) => MaybePromise<GitForgeReleaseAsset[]>;
  openAssetDownload?: (input: {
    asset: GitForgeReleaseAsset;
    release: GitForgeRelease;
    repositoryId: string;
    repositoryKey?: string;
  }) => MaybePromise<GitForgeReleaseAssetDownload | null>;
};

type GitForgeReleaseStorage = {
  createRelease(input: GitForgeRelease): MaybePromise<GitForgeRelease>;
  deleteRelease(repositoryId: string, releaseId: string): MaybePromise<GitForgeRelease | null>;
  listReleases(repositoryId: string): MaybePromise<GitForgeRelease[]>;
  readRelease(repositoryId: string, releaseId: string): MaybePromise<GitForgeRelease | null>;
  updateRelease(
    repositoryId: string,
    releaseId: string,
    input: Partial<Omit<GitForgeRelease, "author_id" | "created_at" | "id" | "repository_id" | "tag_name" | "target_ref">>,
  ): MaybePromise<GitForgeRelease | null>;
};

export type {
  CreateGitForgeReleaseInput,
  DeleteGitForgeReleaseInput,
  GitForgeRelease,
  GitForgeReleaseAsset,
  GitForgeReleaseAssetDownload,
  GitForgeReleaseAssetLink,
  GitForgeReleaseAssetStore,
  GitForgeReleaseStorage,
  UpdateGitForgeReleaseInput,
};
