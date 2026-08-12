type GitArchiveContentFormat = "tar.gz" | "zip";

function archiveContentType(format: GitArchiveContentFormat): string {
  return format === "zip" ? "application/zip" : "application/gzip";
}

export { archiveContentType };
export type { GitArchiveContentFormat };
