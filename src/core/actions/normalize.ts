import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type { GitForgeWorkflow } from "#1mbdfxwwqqpa";
import { text } from "#62f869522d1f";

import {
  SUPPORTED_USES,
  normalizeConcurrency,
  normalizeEnv,
  normalizeJobs,
  normalizeLegacySource,
  normalizeLegacySteps,
  normalizePermissions,
  normalizeTriggers,
  slugify,
} from "./normalize/shared.js";
import {
  buildJobsFromLegacySteps,
  compatibilitySteps,
  firstTriggerKind,
  validateJobs,
} from "./normalize/finalize.js";

function normalizeWorkflowRecord(
  repositoryId: string,
  definitionPath: string,
  raw: unknown,
): GitForgeWorkflow {
  if (!raw || typeof raw !== "object") {
    throw new GitHostError("forge_invalid_workflow_definition", `Workflow definition "${definitionPath}" must contain an object root.`, {
      definitionPath,
      repositoryId,
    });
  }
  const record = raw as Record<string, unknown>;
  const legacySteps = normalizeLegacySteps(record.steps);
  const legacySource = normalizeLegacySource(record.source);
  const triggers = normalizeTriggers(record.on, text(record.trigger), legacySource);
  const jobs = normalizeJobs(record.jobs);
  const schema = jobs.length || record.on != null ? "gha-subset-v1" as const : "legacy-shell-v1" as const;
  const normalizedJobs = jobs.length ? jobs : buildJobsFromLegacySteps(legacySteps);
  if (!normalizedJobs.length) {
    throw new GitHostError("forge_invalid_workflow_definition", `Workflow definition "${definitionPath}" must define at least one runnable job or step.`, {
      definitionPath,
      repositoryId,
    });
  }
  validateJobs(definitionPath, normalizedJobs);
  const name = text(record.name, path.basename(definitionPath, path.extname(definitionPath)));
  return {
    concurrency: normalizeConcurrency(record.concurrency),
    definition_path: definitionPath,
    enabled: record.enabled !== false,
    env: normalizeEnv(record.env),
    id: definitionPath,
    jobs: normalizedJobs,
    name,
    on: triggers,
    origin: "file",
    permissions: normalizePermissions(record.permissions),
    repository_id: repositoryId,
    schema,
    slug: slugify(text(record.slug, name) || path.basename(definitionPath, path.extname(definitionPath))),
    source: legacySource,
    steps: schema === "legacy-shell-v1" ? legacySteps : compatibilitySteps(normalizedJobs),
    supported_uses: Array.from(SUPPORTED_USES),
    trigger: firstTriggerKind(triggers, text(record.trigger)),
  };
}

export {
  SUPPORTED_USES,
  normalizeEnv,
  normalizeWorkflowRecord,
  slugify,
};
