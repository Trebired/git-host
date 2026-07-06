import { GitHostError } from "#ebw9yuqcyi9w";
import type { GitBlob, GitRepositoryHandle, GitTreeEntry } from "#1mbdfxwwqqpa";
import { normalizeRepositoryRelativePath } from "#ynrrpw9yaztf";
import { text } from "#sy81xkgkmoa0";
import { runGitBuffer } from "#96b00569f1f4";
import { decodeBlobContent } from "./helpers.js";

export function normalizeOptionalPath(value: unknown): string {
  const raw = text(value);
  return raw ? normalizeRepositoryRelativePath(raw) : "";
}

export function formatGitTimestamp(epochSecondsInput: unknown, timezoneInput: unknown): string {
  const epochSeconds = Number(epochSecondsInput);
  const timezone = text(timezoneInput);
  if (!Number.isFinite(epochSeconds) || !timezone || !/^[+-]\d{4}$/.test(timezone)) {
    return "";
  }

  const sign = timezone.startsWith("-") ? -1 : 1;
  const hours = Number(timezone.slice(1, 3)) || 0;
  const minutes = Number(timezone.slice(3, 5)) || 0;
  const offsetMinutes = sign * ((hours * 60) + minutes);
  const shifted = new Date((epochSeconds + (offsetMinutes * 60)) * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  const second = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${timezone.slice(0, 3)}:${timezone.slice(3, 5)}`;
}

export async function readTreeEntryBlob(
  repository: GitRepositoryHandle,
  ref: string,
  entry: GitTreeEntry,
): Promise<GitBlob> {
  const objectSpec = `${ref}:${entry.path}`;
  const contentRes = await runGitBuffer(["show", objectSpec], { cwd: repository.path });
  if (!contentRes.ok) {
    throw new GitHostError("git_command_failed", text(contentRes.stderr, "Failed to read blob content."), {
      path: entry.path,
      ref,
      repositoryId: repository.id,
    });
  }

  return {
    object: entry.object,
    path: entry.path,
    ref,
    size: entry.size == null ? 0 : entry.size,
    ...decodeBlobContent(contentRes.stdout),
  };
}
