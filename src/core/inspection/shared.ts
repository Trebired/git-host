import type {
  GitInspectionEmptyBehavior,
  GitInspectionProgressEvent,
  GitInspectionProgressPhase,
  GitInspectionRef,
  GitInspectionTarget,
  GitLinguistProgressEvent,
  GitRepositoryHandle,
  GitRepositoryLinguist,
  MaybePromise,
} from "#1mbdfxwwqqpa";
import { normalizeRepositoryRelativePath } from "#ynrrpw9yaztf";
import { text } from "#sy81xkgkmoa0";

type InspectionProgressCallback = (event: GitInspectionProgressEvent) => MaybePromise<void>;

type InspectionProgressReporter = {
  emit: (
    phase: GitInspectionProgressPhase,
    update?: Partial<Omit<GitInspectionProgressEvent, "emitted_at" | "phase" | "repository_id" | "requested_ref">>,
  ) => Promise<void>;
  emitLinguist: (event: GitLinguistProgressEvent) => Promise<void>;
};

function normalizeInspectionPath(value: unknown): string {
  const raw = text(value);
  return raw ? normalizeRepositoryRelativePath(raw) : "";
}

function normalizeInspectionRef(value: unknown): GitInspectionRef {
  const raw = text(value);
  return raw || "auto";
}

function isExplicitInspectionRef(ref: GitInspectionRef): boolean {
  return text(ref) !== "auto";
}

function resolveEmptyBehavior(value: unknown, explicitRef: boolean): GitInspectionEmptyBehavior {
  const normalized = text(value);
  if (normalized === "error" || normalized === "empty") return normalized;
  return explicitRef ? "error" : "empty";
}

function inspectionSnapshotRef(target: GitInspectionTarget): string {
  if (target.state === "resolved") return target.resolved_ref;
  return target.resolved_ref || (target.requested_ref === "auto" ? "HEAD" : target.requested_ref);
}

function createEmptyLinguistSnapshot(ref: string): GitRepositoryLinguist {
  return {
    commit: "",
    files: {
      bytes: 0,
      count: 0,
      lines: {
        content: 0,
        total: 0,
      },
      results: {},
    },
    languages: {
      bytes: 0,
      count: 0,
      lines: {
        content: 0,
        total: 0,
      },
      results: {},
    },
    ref,
    unknown: {
      bytes: 0,
      count: 0,
      extensions: {},
      filenames: {},
      lines: {
        content: 0,
        total: 0,
      },
    },
  };
}

function countTextLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function getParentPath(pathInput: string): string | null {
  const normalized = normalizeInspectionPath(pathInput);
  if (!normalized) return null;
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : "";
}

function createInspectionProgressReporter(
  repository: GitRepositoryHandle,
  requestedRef: GitInspectionRef,
  onProgress?: InspectionProgressCallback,
): InspectionProgressReporter {
  const callback = typeof onProgress === "function" ? onProgress : null;

  return {
    async emit(phase, update = {}) {
      if (!callback) return;

      await callback({
        commit: typeof update.commit === "string" ? update.commit : undefined,
        emitted_at: new Date().toISOString(),
        error: update.error,
        message: text(update.message, phase),
        percent: Number.isFinite(Number(update.percent)) ? Math.max(0, Math.min(100, Number(update.percent) || 0)) : 0,
        phase,
        raw_linguist: update.raw_linguist,
        repository_id: repository.id,
        requested_ref: requestedRef,
        resolved_ref: update.resolved_ref === undefined ? undefined : update.resolved_ref,
        source: update.source,
      });
    },

    async emitLinguist(event) {
      if (!callback) return;

      await callback({
        commit: event.commit,
        emitted_at: new Date().toISOString(),
        error: event.error,
        message: text(event.message, "Running repository linguist analysis."),
        percent: Number.isFinite(Number(event.percent)) ? Math.max(0, Math.min(100, Number(event.percent) || 0)) : 0,
        phase: "running_linguist",
        raw_linguist: event,
        repository_id: repository.id,
        requested_ref: requestedRef,
        resolved_ref: text(event.ref) || undefined,
        source: "linguist",
      });
    },
  };
}

export {
  countTextLines,
  createEmptyLinguistSnapshot,
  createInspectionProgressReporter,
  getParentPath,
  inspectionSnapshotRef,
  isExplicitInspectionRef,
  normalizeInspectionPath,
  normalizeInspectionRef,
  resolveEmptyBehavior,
};
export type { InspectionProgressReporter };
