import { GitHostError } from "#8974ac53d713";
import { GitBlob, GitDiffFile, GitTreeEntry } from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { assertRepositoryReady, runGit } from "#96b00569f1f4";
import { decodeGitBufferContent } from "#txh6e7rydc5d";

function joinGitPath(basePath: string, childPath: string): string {
  const base = text(basePath).replace(/\/+$/g, "");
  const child = text(childPath).replace(/^\/+/g, "");
  if (!base) return child;
  if (!child) return base;
  return `${base}/${child}`;
}

function parseLsTreeBuffer(stdout: Buffer, basePath = ""): GitTreeEntry[] {
  return stdout.toString("utf8").split("\0").filter(Boolean).map((entry) => {
      const separator = entry.indexOf("\t");
      const meta = separator >= 0 ? entry.slice(0, separator) : entry;
      const rawPath = separator >= 0 ? entry.slice(separator + 1) : "";
      const [mode, type, object, sizeRaw] = meta.split(/\s+/);
      const fullPath = joinGitPath(basePath, rawPath);
      return {
        mode: text(mode),
        name: fullPath.split("/").filter(Boolean).pop() || fullPath,
        object: text(object),
        path: fullPath,
        size: sizeRaw === "-" || !text(sizeRaw) ? null : Number(sizeRaw) || 0,
        type: text(type),
      };
  });
}

const decodeBlobContent: (stdout: Buffer) => Pick<GitBlob, "content"|"encoding"|"is_binary"> =
decodeGitBufferContent;

function withFileStats(
  files: GitDiffFile[],
  fileStats: Map<string, {lines_added:number;lines_removed:number}>,
): GitDiffFile[] {
  return files.map((entry) => {
      const stats = fileStats.get(entry.path) || fileStats.get(entry.original_path) || { lines_added: 0, lines_removed: 0 };
      return {
        ...entry,
        lines_added: stats.lines_added,
        lines_removed: stats.lines_removed,
      };
  });
}

function summarizeFileLines(files: GitDiffFile[]) {
  return files.reduce((sum, file) => ({
        lines_added: sum.lines_added + (Number(file.lines_added) || 0),
        lines_removed: sum.lines_removed + (Number(file.lines_removed) || 0),
    }), { lines_added: 0, lines_removed: 0 });
}

async function resolveCommitForRef(workspaceRoot: string, refInput: unknown, errorMessage: string) {
  const ref = text(refInput);
  if (!ref) throw new GitHostError("git_command_failed", errorMessage);

  const revRes = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], { cwd: workspaceRoot });
  if (!revRes.ok) throw new GitHostError("git_command_failed", text(revRes.stderr, errorMessage), { ref });

  return { commit: text(revRes.stdout), ref };
}

function parseCommitMeta(stdout: string) {
  const [hash, shortHash, parentsRaw, authorName, authorEmail, authoredAt, subject] = String(stdout || "").trim().split("\u001f");
  return {
    author_email: text(authorEmail),
    author_name: text(authorName),
    authored_at: text(authoredAt),
    hash: text(hash),
    parent_hashes: text(parentsRaw).split(/\s+/).map((entry) => text(entry)).filter(Boolean),
    short_hash: text(shortHash),
    subject: text(subject),
  };
}

export {
  assertRepositoryReady,
  decodeBlobContent,
  parseCommitMeta,
  parseLsTreeBuffer,
  resolveCommitForRef,
  summarizeFileLines,
  withFileStats,
};
