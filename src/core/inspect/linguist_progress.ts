import { randomUUID } from "node:crypto";

import type {
  GitLinguistProgressEvent,
  GitLinguistProgressStage,
  GitRepositoryHandle,
  MaybePromise,
} from "../../types.js";
import { text } from "../../utils/text.js";

type GitLinguistProgressCallback = (event: GitLinguistProgressEvent) => MaybePromise<void>;

type CreateLinguistProgressReporterOptions = {
  onProgress?: GitLinguistProgressCallback;
  repository: GitRepositoryHandle;
  ref?: string;
};

type LinguistProgressState = {
  commit: string;
  processed_blobs: number;
  ref: string;
  total_blobs: number;
  total_entries: number;
};

function computeLinguistPercent(stage: GitLinguistProgressStage, state: LinguistProgressState): number {
  if (stage === "queued") return 0;
  if (stage === "resolving_ref") return 5;
  if (stage === "listing_tree") return 10;
  if (stage === "analyzing") return 90;
  if (stage === "completed") return 100;
  if (stage === "failed") {
    if (state.total_blobs > 0) {
      const ratio = state.processed_blobs / state.total_blobs;
      return Math.max(0, Math.min(95, Math.round(15 + (ratio * 70))));
    }
    return 0;
  }

  if (state.total_blobs <= 0) return 15;
  const ratio = state.processed_blobs / state.total_blobs;
  return Math.max(15, Math.min(85, Math.round(15 + (ratio * 70))));
}

function defaultLinguistMessage(stage: GitLinguistProgressStage, state: LinguistProgressState): string {
  switch (stage) {
    case "queued":
      return "Queued linguist scan.";
    case "resolving_ref":
      return "Resolving repository ref.";
    case "listing_tree":
      return "Listing repository tree.";
    case "reading_blobs":
      return state.total_blobs > 0
        ? `Reading repository files (${state.processed_blobs}/${state.total_blobs}).`
        : "Reading repository files.";
    case "analyzing":
      return "Analyzing repository languages.";
    case "completed":
      return "Completed linguist scan.";
    case "failed":
      return "Linguist scan failed.";
    default:
      return "Processing linguist scan.";
  }
}

function createLinguistProgressReporter(options: CreateLinguistProgressReporterOptions) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const scanId = randomUUID();
  const state: LinguistProgressState = {
    commit: "",
    processed_blobs: 0,
    ref: text(options.ref, "HEAD"),
    total_blobs: 0,
    total_entries: 0,
  };

  async function emit(
    stage: GitLinguistProgressStage,
    update: Partial<Omit<GitLinguistProgressEvent, "emitted_at" | "percent" | "repository_id" | "scan_id" | "stage">> = {},
  ): Promise<void> {
    if (!onProgress) return;

    if (typeof update.ref === "string") state.ref = text(update.ref, state.ref);
    if (typeof update.commit === "string") state.commit = text(update.commit, state.commit);
    if (typeof update.total_entries === "number") state.total_entries = Math.max(0, Number(update.total_entries) || 0);
    if (typeof update.total_blobs === "number") state.total_blobs = Math.max(0, Number(update.total_blobs) || 0);
    if (typeof update.processed_blobs === "number") state.processed_blobs = Math.max(0, Number(update.processed_blobs) || 0);

    await onProgress({
      commit: text(update.commit, state.commit) || undefined,
      emitted_at: new Date().toISOString(),
      error: update.error,
      message: text(update.message, defaultLinguistMessage(stage, state)),
      percent: computeLinguistPercent(stage, state),
      processed_blobs: state.processed_blobs,
      ref: text(update.ref, state.ref),
      repository_id: options.repository.id,
      scan_id: scanId,
      stage,
      total_blobs: state.total_blobs,
      total_entries: state.total_entries,
    });
  }

  return {
    emit,
    scanId,
  };
}

export { createLinguistProgressReporter };
export type { GitLinguistProgressCallback };
