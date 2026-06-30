import { GitHostError } from "#8974ac53d713";
import type { GitForgeWorkflow, GitForgeWorkflowJob } from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

type PlannedWorkflowJobInstance = {
  index: number;
  job: GitForgeWorkflowJob;
  matrix?: Record<string, boolean | number | string>;
  name: string;
};

function cartesianProduct(entries: Array<[string, Array<boolean | number | string>]>) {
  if (!entries.length) return [{}];
  const [[key, values], ...rest] = entries;
  const remainder = cartesianProduct(rest);
  const rows: Array<Record<string, boolean | number | string>> = [];
  for (const value of values) {
    for (const tail of remainder) {
      rows.push({
        [key]: value,
        ...tail,
      });
    }
  }
  return rows;
}

function matrixKey(matrix: Record<string, boolean | number | string>) {
  return Object.entries(matrix)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("|");
}

function expandJobMatrix(job: GitForgeWorkflowJob): Array<Record<string, boolean | number | string> | undefined> {
  const matrix = job.strategy?.matrix;
  if (!matrix) return [undefined];
  const baseRows = cartesianProduct(Object.entries(matrix.values || {}));
  const seen = new Set(baseRows.map((entry) => matrixKey(entry)));
  const extras = (matrix.include || []).filter((entry) => {
    const key = matrixKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rows = [...baseRows, ...extras];
  return rows.length ? rows : [undefined];
}

function jobDisplayName(job: GitForgeWorkflowJob, matrix?: Record<string, boolean | number | string>) {
  if (!matrix || !Object.keys(matrix).length) return job.name;
  const suffix = Object.entries(matrix)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  return `${job.name} (${suffix})`;
}

function planWorkflowJobs(workflow: GitForgeWorkflow): PlannedWorkflowJobInstance[] {
  const planned: PlannedWorkflowJobInstance[] = [];
  let index = 0;
  for (const job of workflow.jobs) {
    for (const matrix of expandJobMatrix(job)) {
      planned.push({
        index,
        job,
        ...(matrix ? { matrix } : {}),
        name: jobDisplayName(job, matrix),
      });
      index += 1;
    }
  }
  return planned;
}

function assertAcyclicWorkflow(workflow: GitForgeWorkflow) {
  const byId = new Map(workflow.jobs.map((job) => [job.id, job] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(jobId: string, trail: string[]) {
    if (visited.has(jobId)) return;
    if (visiting.has(jobId)) {
      throw new GitHostError("forge_invalid_workflow_definition", `Workflow "${workflow.id}" has a circular needs graph.`, {
        cycle: [...trail, jobId],
        workflowId: workflow.id,
      });
    }
    visiting.add(jobId);
    const job = byId.get(jobId);
    if (!job) {
      throw new GitHostError("forge_invalid_workflow_definition", `Workflow "${workflow.id}" references unknown job "${jobId}".`, {
        jobId,
        workflowId: workflow.id,
      });
    }
    for (const need of job.needs || []) {
      visit(need, [...trail, jobId]);
    }
    visiting.delete(jobId);
    visited.add(jobId);
  }

  for (const job of workflow.jobs) {
    visit(job.id, []);
  }
}

function resolveRefName(ref: string) {
  const value = text(ref);
  if (value.startsWith("refs/heads/")) return value.slice("refs/heads/".length);
  if (value.startsWith("refs/tags/")) return value.slice("refs/tags/".length);
  const segments = value.split("/");
  return segments[segments.length - 1] || value;
}

export {
  assertAcyclicWorkflow,
  planWorkflowJobs,
  resolveRefName,
};

export type { PlannedWorkflowJobInstance };
