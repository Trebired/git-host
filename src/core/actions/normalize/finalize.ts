import { GitHostError } from "#8974ac53d713";
import type {
  GitForgeWorkflowJob,
  GitForgeWorkflowJobStep,
  GitForgeWorkflowStep,
  GitForgeWorkflowTriggers,
  GitForgeWorkflowTriggerKind,
} from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

import { SUPPORTED_USES } from "./shared.js";

function assertSupportedUses(step: GitForgeWorkflowJobStep, definitionPath: string) {
  if (!step.uses) return;
  if (SUPPORTED_USES.includes(step.uses as typeof SUPPORTED_USES[number])) return;
  throw new GitHostError("forge_invalid_workflow_definition", `Workflow definition "${definitionPath}" uses unsupported action "${step.uses}".`, {
    definitionPath,
    uses: step.uses,
  });
}

function validateJobs(definitionPath: string, jobs: GitForgeWorkflowJob[]) {
  const known = new Set(jobs.map((job) => job.id));
  for (const job of jobs) {
    for (const need of job.needs || []) {
      if (!known.has(need)) {
        throw new GitHostError("forge_invalid_workflow_definition", `Workflow definition "${definitionPath}" references unknown job "${need}" in needs.`, {
          definitionPath,
          jobId: job.id,
          need,
        });
      }
    }
    for (const step of job.steps) assertSupportedUses(step, definitionPath);
  }
}

function buildJobsFromLegacySteps(steps: GitForgeWorkflowStep[]): GitForgeWorkflowJob[] {
  if (!steps.length) return [];
  return [{
    id: "default",
    name: "default",
    runs_on: ["local"],
    steps: steps.map((step) => ({
      env: step.env,
      id: step.id,
      kind: "shell" as const,
      name: step.name,
      run: step.run,
      shell: step.shell,
    })),
  }];
}

function firstTriggerKind(triggers: GitForgeWorkflowTriggers | undefined, legacyTrigger: string): GitForgeWorkflowTriggerKind {
  if (triggers?.push) return "push";
  if (triggers?.workflow_dispatch) return "manual";
  return text(legacyTrigger) as GitForgeWorkflowTriggerKind;
}

function compatibilitySteps(jobs: GitForgeWorkflowJob[]): GitForgeWorkflowStep[] {
  const firstJob = jobs[0];
  if (!firstJob) return [];
  return firstJob.steps
    .filter((step) => step.kind !== "uses" && step.run)
    .map((step, index) => ({
      env: step.env,
      id: step.id,
      kind: "shell" as const,
      name: text(step.name, `Step ${index + 1}`),
      run: text(step.run),
      shell: step.shell,
    }));
}

export {
  buildJobsFromLegacySteps,
  compatibilitySteps,
  firstTriggerKind,
  validateJobs,
};
