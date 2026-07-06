import type {
  GitForgeWorkflowConcurrency,
  GitForgeWorkflowDispatchInput,
  GitForgeWorkflowDispatchInputType,
  GitForgeWorkflowJob,
  GitForgeWorkflowJobMatrix,
  GitForgeWorkflowJobStep,
  GitForgeWorkflowJobStrategy,
  GitForgeWorkflowPermissions,
  GitForgeWorkflowPushTrigger,
  GitForgeWorkflowStep,
  GitForgeWorkflowTriggers,
} from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

const SUPPORTED_USES = [
  "actions/checkout",
  "actions/checkout@v4",
  "actions/download-artifact",
  "actions/download-artifact@v4",
  "actions/publish-release-asset",
  "actions/publish-release-asset@v1",
  "actions/setup-node",
  "actions/setup-node@v4",
  "actions/upload-artifact",
  "actions/upload-artifact@v4",
  "oven-sh/setup-bun",
  "oven-sh/setup-bun@v2",
] as const;

function slugify(value: string): string {
  const next = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return next || "workflow";
}

function normalizeEnv(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const next = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [text(key), text(entry)] as const)
      .filter(([key, entry]) => key && entry),
  );
  return Object.keys(next).length ? next : undefined;
}

function normalizeLegacySource(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const branches = Array.isArray(input.branches) ? input.branches.map((entry) => text(entry)).filter(Boolean) : undefined;
  const tags = Array.isArray(input.tags) ? input.tags.map((entry) => text(entry)).filter(Boolean) : undefined;
  const env = normalizeEnv(input.env);
  if (!branches?.length && !tags?.length && !env) return undefined;
  return {
    ...(branches?.length ? { branches } : {}),
    ...(env ? { env } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}

function normalizePermissions(value: unknown): GitForgeWorkflowPermissions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const next = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [text(key), text(entry)] as const)
      .filter(([key, entry]) => key && entry),
  );
  return Object.keys(next).length ? next : undefined;
}

function normalizeConcurrency(value: unknown): GitForgeWorkflowConcurrency | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const group = text(value);
    return group ? { group } : undefined;
  }
  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const group = text(record.group);
  if (!group) return undefined;
  return {
    cancel_in_progress: record["cancel-in-progress"] === true || record.cancel_in_progress === true,
    group,
  };
}

function normalizeDispatchInputType(value: unknown): GitForgeWorkflowDispatchInputType {
  return text(value) === "boolean" ? "boolean" : "string";
}

function normalizeDispatchInputs(value: unknown): GitForgeWorkflowDispatchInput[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([name, input]) => {
      if (!input || typeof input !== "object") return null;
      const record = input as Record<string, unknown>;
      const type = normalizeDispatchInputType(record.type);
      const defaultValue = record.default;
      const normalizedDefault = type === "boolean"
        ? (defaultValue === true || defaultValue === "true" ? true : (defaultValue === false || defaultValue === "false" ? false : undefined))
        : (defaultValue == null ? undefined : text(defaultValue));
      return {
        ...(normalizedDefault !== undefined ? { default: normalizedDefault } : {}),
        description: text(record.description),
        name: text(name),
        required: record.required === true,
        type,
      } satisfies GitForgeWorkflowDispatchInput;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.name));
  return entries.length ? entries : undefined;
}

function normalizePushTrigger(value: unknown): GitForgeWorkflowPushTrigger | undefined {
  if (value === true || value == null) return {};
  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const branches = Array.isArray(record.branches) ? record.branches.map((entry) => text(entry)).filter(Boolean) : undefined;
  const tags = Array.isArray(record.tags) ? record.tags.map((entry) => text(entry)).filter(Boolean) : undefined;
  if (!branches?.length && !tags?.length) return {};
  return {
    ...(branches?.length ? { branches } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}

function normalizeTriggers(value: unknown, legacyTrigger: string, legacySource?: { branches?: string[]; tags?: string[] }): GitForgeWorkflowTriggers | undefined {
  if (typeof value === "string") {
    if (value === "push") return { push: normalizePushTrigger({ branches: legacySource?.branches, tags: legacySource?.tags }) };
    if (value === "workflow_dispatch") return { workflow_dispatch: {} };
    return undefined;
  }
  if (Array.isArray(value)) {
    const next: GitForgeWorkflowTriggers = {};
    for (const entry of value.map((item) => text(item)).filter(Boolean)) {
      if (entry === "push") next.push = normalizePushTrigger({ branches: legacySource?.branches, tags: legacySource?.tags });
      if (entry === "workflow_dispatch") next.workflow_dispatch = {};
    }
    return Object.keys(next).length ? next : undefined;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: GitForgeWorkflowTriggers = {};
    if ("push" in record) next.push = normalizePushTrigger(record.push);
    if ("workflow_dispatch" in record) {
      const workflowDispatch = record.workflow_dispatch === true
        ? {}
        : (record.workflow_dispatch && typeof record.workflow_dispatch === "object"
          ? { inputs: normalizeDispatchInputs((record.workflow_dispatch as Record<string, unknown>).inputs) }
          : {});
      next.workflow_dispatch = workflowDispatch;
    }
    return Object.keys(next).length ? next : undefined;
  }
  if (legacyTrigger === "push") return { push: normalizePushTrigger({ branches: legacySource?.branches, tags: legacySource?.tags }) };
  if (legacyTrigger === "manual") return { workflow_dispatch: {} };
  return undefined;
}

function normalizeScalar(value: unknown): boolean | number | string | undefined {
  if (typeof value === "boolean" || typeof value === "number") return value;
  const next = text(value);
  return next ? next : undefined;
}

function normalizeStepWith(value: unknown): Record<string, boolean | number | string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const next = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [text(key), normalizeScalar(entry)] as const)
      .filter(([key, entry]) => key && entry !== undefined),
  );
  return Object.keys(next).length ? next : undefined;
}

function normalizeLegacySteps(value: unknown): GitForgeWorkflowStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const step = entry as Record<string, unknown>;
      const run = text(step.run);
      if (!run) return null;
      return {
        env: normalizeEnv(step.env),
        id: text(step.id, `step-${index + 1}`),
        kind: "shell" as const,
        name: text(step.name, `Step ${index + 1}`),
        run,
        shell: text(step.shell),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function normalizeJobSteps(value: unknown, jobId: string): GitForgeWorkflowJobStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const step = entry as Record<string, unknown>;
      const run = text(step.run);
      const uses = text(step.uses);
      if (!run && !uses) return null;
      return {
        env: normalizeEnv(step.env),
        id: text(step.id, `${jobId}-step-${index + 1}`),
        if: text(step.if),
        kind: uses ? "uses" as const : "shell" as const,
        name: text(step.name, uses ? `Use ${uses}` : `Step ${index + 1}`),
        run: run || undefined,
        shell: text(step.shell),
        uses: uses || undefined,
        with: normalizeStepWith(step.with),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function normalizeMatrix(value: unknown): GitForgeWorkflowJobMatrix | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const include = Array.isArray(record.include)
    ? record.include
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const normalized = Object.fromEntries(
          Object.entries(entry as Record<string, unknown>)
            .map(([key, item]) => [text(key), normalizeScalar(item)] as const)
            .filter(([key, item]) => key && item !== undefined),
        );
        return Object.keys(normalized).length ? normalized : null;
      })
      .filter((entry): entry is Record<string, boolean | number | string> => Boolean(entry))
    : undefined;
  const values = Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== "include")
      .map(([key, entry]) => {
        const list = Array.isArray(entry) ? entry : [entry];
        return [
          text(key),
          list.map((item) => normalizeScalar(item)).filter((item): item is boolean | number | string => item !== undefined),
        ] as const;
      })
      .filter(([key, entry]) => key && entry.length),
  );
  if (!Object.keys(values).length && !include?.length) return undefined;
  return {
    ...(include?.length ? { include } : {}),
    values,
  };
}

function normalizeStrategy(value: unknown): GitForgeWorkflowJobStrategy | undefined {
  if (!value || typeof value !== "object") return undefined;
  const matrix = normalizeMatrix((value as Record<string, unknown>).matrix);
  return matrix ? { matrix } : undefined;
}

function normalizeRunsOn(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => text(entry)).filter(Boolean);
}

function normalizeNeeds(value: unknown): string[] | undefined {
  const entries = Array.isArray(value) ? value : (text(value) ? [value] : []);
  const next = entries.map((entry) => text(entry)).filter(Boolean);
  return next.length ? next : undefined;
}

function normalizeJobs(value: unknown): GitForgeWorkflowJob[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([jobId, entry]) => {
      if (!entry || typeof entry !== "object") return null;
      const job = entry as Record<string, unknown>;
      const runsOn = normalizeRunsOn(job["runs-on"]);
      const steps = normalizeJobSteps(job.steps, text(jobId));
      if (!runsOn.length || !steps.length) return null;
      return {
        env: normalizeEnv(job.env),
        id: text(jobId),
        if: text(job.if),
        name: text(job.name, text(jobId)),
        needs: normalizeNeeds(job.needs),
        runs_on: runsOn,
        steps,
        strategy: normalizeStrategy(job.strategy),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

export {
  SUPPORTED_USES,
  normalizeConcurrency,
  normalizeEnv,
  normalizeJobs,
  normalizeLegacySource,
  normalizeLegacySteps,
  normalizePermissions,
  normalizeTriggers,
  slugify,
};
