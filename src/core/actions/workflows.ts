import fs from "node:fs";
import path from "node:path";

import { load as loadYaml } from "js-yaml";

import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeActionsOptions,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowSource,
  GitForgeWorkflowStep,
  GitForgeWorkflowTriggerKind,
} from "#1mbdfxwwqqpa";
import { runGit } from "#96b00569f1f4";
import { normalizeRepositoryRelativePath } from "#390741ebf5ab";
import { text } from "#62f869522d1f";

type ListRepositoryWorkflowsOptions = {
  filters?: GitForgeWorkflowFilters;
  ref?: string;
  repositoryId: string;
  repositoryPath: string;
  workflowRoot: string;
};

type ReadRepositoryWorkflowOptions = {
  ref?: string;
  repositoryId: string;
  repositoryPath: string;
  workflowId: string;
  workflowRoot: string;
};

const WORKFLOW_FILE_PATTERN = /\.ya?ml$/i;

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

function normalizeWorkflowSource(value: unknown): GitForgeWorkflowSource | undefined {
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

function normalizeWorkflowSteps(value: unknown): GitForgeWorkflowStep[] {
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
  const steps = normalizeWorkflowSteps(record.steps);
  if (!steps.length) {
    throw new GitHostError("forge_invalid_workflow_definition", `Workflow definition "${definitionPath}" must define at least one step.`, {
      definitionPath,
      repositoryId,
    });
  }
  const name = text(record.name, path.basename(definitionPath, path.extname(definitionPath)));
  const trigger = text(record.trigger) as GitForgeWorkflowTriggerKind;
  if (!trigger) {
    throw new GitHostError("forge_invalid_workflow_definition", `Workflow definition "${definitionPath}" must define a trigger.`, {
      definitionPath,
      repositoryId,
    });
  }
  return {
    definition_path: definitionPath,
    enabled: record.enabled !== false,
    env: normalizeEnv(record.env),
    id: definitionPath,
    name,
    origin: "file",
    repository_id: repositoryId,
    slug: slugify(text(record.slug, name) || path.basename(definitionPath, path.extname(definitionPath))),
    source: normalizeWorkflowSource(record.source),
    steps,
    trigger,
  };
}

function matchesWorkflowFilters(entry: GitForgeWorkflow, filters: GitForgeWorkflowFilters = {}) {
  if (filters.enabled != null && entry.enabled !== (filters.enabled === true)) return false;
  const query = text(filters.query).toLowerCase();
  if (query && ![entry.id, entry.name, entry.slug, entry.definition_path].some((value) => text(value).toLowerCase().includes(query))) return false;
  const triggers = Array.isArray(filters.trigger) ? filters.trigger : (filters.trigger ? [filters.trigger] : []);
  if (triggers.length && !triggers.map((value) => text(value)).includes(text(entry.trigger))) return false;
  return true;
}

function sortWorkflows(entries: GitForgeWorkflow[]) {
  return Array.from(entries).sort((left, right) => (
    text(left.name).localeCompare(text(right.name))
    || text(left.definition_path).localeCompare(text(right.definition_path))
  ));
}

function resolveWorkflowRoot(defaultRoot: string | undefined, overrideRoot: string | undefined): string {
  return normalizeRepositoryRelativePath(text(overrideRoot, defaultRoot) || ".git-host");
}

async function resolveRepositoryWorkflowRoot(
  actions: CreateGitForgeActionsOptions | undefined,
  repositoryId: string,
): Promise<string> {
  const override = actions?.resolveWorkflowRoot
    ? await actions.resolveWorkflowRoot(repositoryId)
    : undefined;
  return resolveWorkflowRoot(actions?.workflowRoot, text(override));
}

function workflowDirectoryFromRoot(workflowRoot: string) {
  return normalizeRepositoryRelativePath(path.posix.join(workflowRoot, "workflows"));
}

function workflowFileDefinitionPath(workflowRoot: string, relativeFilePath: string) {
  return normalizeRepositoryRelativePath(path.posix.join(workflowDirectoryFromRoot(workflowRoot), relativeFilePath));
}

async function listWorkflowDefinitionPaths(
  repositoryPath: string,
  workflowRoot: string,
  ref?: string,
): Promise<string[]> {
  const workflowDirectory = workflowDirectoryFromRoot(workflowRoot);
  if (text(ref)) {
    const result = await runGit(["ls-tree", "-r", "--name-only", text(ref), "--", workflowDirectory], {
      cwd: repositoryPath,
    });
    if (!result.ok) {
      throw new GitHostError("forge_workflow_definition_not_found", `Failed to enumerate workflow definitions at ref "${ref}".`, {
        ref,
        repositoryPath,
        workflowDirectory,
      });
    }
    return text(result.stdout)
      .split(/\r?\n/)
      .map((entry) => normalizeRepositoryRelativePath(entry, { allowEmpty: true }))
      .filter((entry) => entry && WORKFLOW_FILE_PATTERN.test(entry));
  }

  const absoluteDirectory = path.join(repositoryPath, workflowDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const results: string[] = [];
  const stack = [absoluteDirectory];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(repositoryPath, absolutePath).replace(/\\/g, "/");
      const normalized = normalizeRepositoryRelativePath(relativePath);
      if (WORKFLOW_FILE_PATTERN.test(normalized)) {
        results.push(normalized);
      }
    }
  }
  return results;
}

async function readWorkflowDefinitionContent(
  repositoryPath: string,
  definitionPath: string,
  ref?: string,
): Promise<string> {
  if (text(ref)) {
    const result = await runGit(["show", `${text(ref)}:${definitionPath}`], {
      cwd: repositoryPath,
    });
    if (!result.ok) {
      throw new GitHostError("forge_workflow_definition_not_found", `Workflow definition "${definitionPath}" was not found at ref "${ref}".`, {
        definitionPath,
        ref,
        repositoryPath,
      });
    }
    return text(result.stdout);
  }

  const absolutePath = path.join(repositoryPath, definitionPath);
  if (!fs.existsSync(absolutePath)) {
    throw new GitHostError("forge_workflow_definition_not_found", `Workflow definition "${definitionPath}" was not found.`, {
      definitionPath,
      repositoryPath,
    });
  }
  return fs.readFileSync(absolutePath, "utf8");
}

async function readWorkflowDefinition(
  repositoryId: string,
  repositoryPath: string,
  workflowRoot: string,
  definitionPath: string,
  ref?: string,
): Promise<GitForgeWorkflow> {
  const content = await readWorkflowDefinitionContent(repositoryPath, definitionPath, ref);
  const parsed = loadYaml(content);
  return normalizeWorkflowRecord(repositoryId, definitionPath, parsed);
}

async function listRepositoryWorkflows(options: ListRepositoryWorkflowsOptions): Promise<GitForgeWorkflow[]> {
  const definitionPaths = await listWorkflowDefinitionPaths(options.repositoryPath, options.workflowRoot, options.ref);
  const workflows = await Promise.all(definitionPaths.map(async (definitionPath) => (
    await readWorkflowDefinition(options.repositoryId, options.repositoryPath, options.workflowRoot, definitionPath, options.ref)
  )));
  return sortWorkflows(workflows.filter((entry) => matchesWorkflowFilters(entry, options.filters)));
}

async function readRepositoryWorkflow(options: ReadRepositoryWorkflowOptions): Promise<GitForgeWorkflow> {
  const definitionPath = normalizeRepositoryRelativePath(text(options.workflowId));
  const workflowDirectory = workflowDirectoryFromRoot(options.workflowRoot);
  if (!(definitionPath === workflowDirectory || definitionPath.startsWith(`${workflowDirectory}/`))) {
    throw new GitHostError("forge_workflow_definition_not_found", `Workflow "${options.workflowId}" is outside the configured workflow directory.`, {
      repositoryId: options.repositoryId,
      workflowId: options.workflowId,
      workflowRoot: options.workflowRoot,
    });
  }
  return await readWorkflowDefinition(
    options.repositoryId,
    options.repositoryPath,
    options.workflowRoot,
    definitionPath,
    options.ref,
  );
}

export {
  listRepositoryWorkflows,
  readRepositoryWorkflow,
  resolveRepositoryWorkflowRoot,
  workflowDirectoryFromRoot,
  workflowFileDefinitionPath,
};
