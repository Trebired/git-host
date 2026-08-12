import type { GitDirectoryEntry, GitRepositoryHandle } from "#14021226ec9b";
import { readRepositoryBlob } from "#632ac808a058";
import { countTextLines } from "./shared.js";

async function readLineCountForEntry(
  repository: GitRepositoryHandle,
  ref: string,
  entry: GitDirectoryEntry,
): Promise<number|undefined> {
  if (entry.kind !== "file") return undefined;

  const blob = await readRepositoryBlob(repository, {
      path: entry.path,
      ref,
  });

  if (blob.is_binary || blob.encoding !== "utf8") return undefined;
  return countTextLines(blob.content);
}

export { readLineCountForEntry };
