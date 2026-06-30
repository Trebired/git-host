import fs from "node:fs";
import path from "node:path";

import { load as loadYaml } from "js-yaml";

import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeActionsOptions,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowTriggerKind,
} from "#1mbdfxwwqqpa";
import { runGit } from "#96b00569f1f4";
import { normalizeRepositoryRelativePath } from "#390741ebf5ab";
import { text } from "#62f869522d1f";
import { normalizeWorkflowRecord } from "./normalize.js";

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

function matchRefPattern(value: string, pattern: string) {
  const normalizedValue = text(value);
  const normalizedPattern = text(pattern);
  if (!normalizedPattern) return false;
  if (!normalizedPattern.includes("*")) return normalizedValue === normalizedPattern;
  const regex = new RegExp(`^${normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return regex.test(normalizedValue);
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
    await readWorkflowDefinition(options.repositoryId, options.repositoryPath, definitionPath, options.ref)
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
    definitionPath,
    options.ref,
  );
}

function matchesWorkflowTrigger(workflow: GitForgeWorkflow, triggerKind: GitForgeWorkflowTriggerKind, context: Record<string, unknown>) {
  if (!workflow.enabled) return false;
  if (triggerKind === "manual") {
    return workflow.on?.workflow_dispatch != null || text(workflow.trigger) === "manual";
  }
  if (triggerKind === "push") {
    if (!workflow.on?.push && text(workflow.trigger) !== "push") return false;
    const branch = text(context.branch);
    const tag = text(context.tag_name, text(context.tag));
    const branches = workflow.on?.push?.branches || workflow.source?.branches || [];
    const tags = workflow.on?.push?.tags || workflow.source?.tags || [];
    if (branches.length && !branches.some((pattern) => matchRefPattern(branch, pattern))) return false;
    if (tags.length && !tags.some((pattern) => matchRefPattern(tag, pattern))) return false;
    return true;
  }
  return text(workflow.trigger) === text(triggerKind);
}

export {
  listRepositoryWorkflows,
  matchesWorkflowTrigger,
  readRepositoryWorkflow,
  resolveRepositoryWorkflowRoot,
  workflowDirectoryFromRoot,
};
