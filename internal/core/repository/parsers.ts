import type {
  GitBranchSummary,
  GitCommitSummary,
  GitDiffFile,
  GitRemoteSummary,
  GitRepositoryStatus,
  GitTagSummary,
  GitStatusEntry,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

function parseBranchLine(line: string) {
  const next = String(line || "").trim();
  const out = { ahead: 0, behind: 0, current_branch: "", upstream: "" };
  if (!next.startsWith("## ")) return out;

  const body = next.slice(3).trim();
  if (body.startsWith("No commits yet on ")) {
    out.current_branch = text(body.slice("No commits yet on ".length));
    return out;
  }
  if (body.startsWith("Initial commit on ")) {
    out.current_branch = text(body.slice("Initial commit on ".length));
    return out;
  }

  const match = body.match(/^([^.\s]+)(?:\.\.\.([^\s]+))?(?: \[(.+)\])?$/);
  if (!match) {
    out.current_branch = body;
    return out;
  }

  out.current_branch = text(match[1]);
  out.upstream = text(match[2]);
  const deltas = text(match[3]);
  if (deltas) {
    deltas.split(",").map((entry) => entry.trim()).forEach((entry) => {
      const ahead = entry.match(/^ahead (\d+)$/);
      if (ahead) out.ahead = Number(ahead[1]) || 0;
      const behind = entry.match(/^behind (\d+)$/);
      if (behind) out.behind = Number(behind[1]) || 0;
    });
  }

  return out;
}

function parseStatusOutput(stdout: string): GitRepositoryStatus {
  const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
  const branch = parseBranchLine(lines[0] || "");
  const entries: GitStatusEntry[] = [];
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicted = 0;

  for (const line of lines.slice(branch.current_branch ? 1 : 0)) {
    const code = line.slice(0, 2);
    const rawPath = line.slice(3).trim();
    const pathParts = rawPath.split(" -> ");
    const finalPath = pathParts[pathParts.length - 1] || rawPath;
    const stagedEntry = Boolean(code[0] && code[0] !== " " && code[0] !== "?");
    const unstagedEntry = Boolean(code[1] && code[1] !== " ");
    const untrackedEntry = code === "??";
    const conflictedEntry = /U|A{2}|D{2}/.test(code);

    if (stagedEntry) staged += 1;
    if (unstagedEntry) unstaged += 1;
    if (untrackedEntry) untracked += 1;
    if (conflictedEntry) conflicted += 1;

    entries.push({
      code,
      conflicted: conflictedEntry,
      original_path: rawPath,
      path: finalPath,
      staged: stagedEntry,
      unstaged: unstagedEntry,
      untracked: untrackedEntry,
    });
  }

  return {
    ahead: branch.ahead,
    behind: branch.behind,
    clean: entries.length === 0,
    conflicted,
    current_branch: branch.current_branch,
    entries,
    operation: {
      can_abort: false,
      can_continue: false,
      in_progress: false,
      kind: "",
      label: "",
    },
    staged,
    untracked,
    unstaged,
    upstream: branch.upstream,
  };
}

function parseBranchesOutput(stdout: string): GitBranchSummary[] {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, head, upstream, commit] = line.split("\t");
      return {
        current: text(head) === "*",
        head_commit: text(commit),
        name: text(name),
        upstream: text(upstream),
      };
    });
}

function parseRemotesOutput(stdout: string): GitRemoteSummary[] {
  const remotes = new Map<string, GitRemoteSummary>();
  String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [name, url, kindWithParens] = line.split(/\s+/);
      const kind = text(kindWithParens).replace(/[()]/g, "");
      if (!name || !url || !kind) return;
      const current = remotes.get(name) || { fetch_url: "", name, push_url: "" };
      if (kind === "fetch") current.fetch_url = url;
      if (kind === "push") current.push_url = url;
      remotes.set(name, current);
    });
  return Array.from(remotes.values());
}

function parseCommitLogOutput(stdout: string): GitCommitSummary[] {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, authorName, authorEmail, authoredAt, subject] = line.split("\u001f");
      return {
        author_email: text(authorEmail),
        author_name: text(authorName),
        authored_at: text(authoredAt),
        hash: text(hash),
        short_hash: text(shortHash),
        subject: text(subject),
      };
    });
}

function parseTagsOutput(stdout: string): GitTagSummary[] {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, hash, shortHash, objectType, taggerName, taggerEmail, taggedAt, subject, targetHash, targetShortHash, targetType] = line.split("\u001f");
      const annotated = text(objectType) === "tag";
      return {
        annotated,
        hash: text(hash),
        name: text(name),
        short_hash: text(shortHash),
        subject: text(subject),
        tagged_at: text(taggedAt),
        tagger_email: text(taggerEmail).replace(/^<|>$/g, ""),
        tagger_name: text(taggerName),
        target_hash: text(targetHash, text(hash)),
        target_short_hash: text(targetShortHash, text(shortHash)),
        target_type: text(targetType, text(objectType)),
      };
    });
}

function parseNameStatusOutput(stdout: string): GitDiffFile[] {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2).trim();
      const rest = line.slice(2).trim();
      const parts = rest.split(/\t+/);
      const finalPath = parts[parts.length - 1] || rest;
      const originalPath = parts[0] || finalPath;
      return {
        change_kind: code || "M",
        lines_added: 0,
        lines_removed: 0,
        original_path: text(originalPath),
        path: text(finalPath),
      };
    });
}

function parseNumstatOutput(stdout: string): Map<string, { lines_added: number; lines_removed: number }> {
  const map = new Map<string, { lines_added: number; lines_removed: number }>();
  String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [addedRaw, removedRaw, filePath] = line.split(/\t+/);
      if (!filePath) return;
      map.set(filePath, {
        lines_added: addedRaw === "-" ? 0 : Number(addedRaw) || 0,
        lines_removed: removedRaw === "-" ? 0 : Number(removedRaw) || 0,
      });
    });
  return map;
}

export {
  parseBranchesOutput,
  parseCommitLogOutput,
  parseNameStatusOutput,
  parseNumstatOutput,
  parseRemotesOutput,
  parseStatusOutput,
  parseTagsOutput,
};
