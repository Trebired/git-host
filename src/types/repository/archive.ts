type GitArchiveFormat = "tar" | "tar.gz" | "zip";
type GitSourceArchiveFormat = "tar.gz" | "zip";
type GitArchiveCacheStatus = "hit" | "miss";

type GitSourceArchiveLink = {
  file_name?: string;
  format: GitSourceArchiveFormat;
  href: string;
  ref?: string;
  root_directory?: string;
};

type GitSourceArchiveLinks = {
  tar_gz: GitSourceArchiveLink;
  zip: GitSourceArchiveLink;
};

type GitArchiveMetadata = {
  cache_key: string;
  cache_status: GitArchiveCacheStatus;
  content_type: string;
  file_name: string;
  format: GitSourceArchiveFormat;
  ref: string;
  resolved_commit: string;
  root_directory: string;
  size: number | null;
};

type GitArchive = GitArchiveMetadata & {
  content: string;
  encoding: "base64";
};

type GitArchiveDownload = {
  completed: Promise<GitArchiveMetadata>;
  metadata: GitArchiveMetadata;
  redirect_url?: string;
  stream: NodeJS.ReadableStream;
};

export type {
  GitArchive,
  GitArchiveCacheStatus,
  GitArchiveDownload,
  GitArchiveFormat,
  GitArchiveMetadata,
  GitSourceArchiveFormat,
  GitSourceArchiveLink,
  GitSourceArchiveLinks,
};
