import type { CreateGitForgeActionsOptions } from "#14021226ec9b";
import type {
  GitHostConfig,
  NormalizedGitHostConfig,
} from "./types.js";

function defineConfig<TConfig extends GitHostConfig>(config: TConfig): TConfig {
  return config;
}

function normalizeConfig(config: GitHostConfig = {}): NormalizedGitHostConfig {
  if (!isRecord(config)) throw new Error("git-host config must be an object");
  return {
    actions: normalizeActions(config.actions),
  };
}

function mergeActionsOptions(
  defaults: CreateGitForgeActionsOptions,
  options: CreateGitForgeActionsOptions | undefined,
): CreateGitForgeActionsOptions {
  return {
    ...defaults,
    ...(options || {}),
    environment: mergeObjects(defaults.environment, options?.environment),
    localRunner: mergeObjects(defaults.localRunner, options?.localRunner),
    runner: mergeObjects(defaults.runner, options?.runner),
  };
}

function normalizeActions(input: GitHostConfig["actions"]): CreateGitForgeActionsOptions {
  if (!isRecord(input)) return {};
  return {
    ...input,
    environment: isRecord(input.environment) ? input.environment : undefined,
    heartbeatIntervalMs: normalizePositiveNumber(input.heartbeatIntervalMs),
    localRunner: isRecord(input.localRunner) ? input.localRunner : undefined,
    localRunnerLabels: normalizeStringList(input.localRunnerLabels),
    runner: isRecord(input.runner) ? input.runner : undefined,
    shell: normalizeString(input.shell),
    workspaceRoot: normalizeString(input.workspaceRoot),
    workflowRoot: normalizeString(input.workflowRoot),
  };
}

function mergeObjects<TValue extends object>(left: TValue | undefined, right: TValue | undefined): TValue | undefined {
  if (!left && !right) return undefined;
  return {
    ...(left || {}),
    ...(right || {}),
  } as TValue;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, value) : undefined;
}

function normalizeString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const normalized = Array.from(new Set(values.map(normalizeString).filter(Boolean) as string[]));
  return normalized.length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export {
  defineConfig,
  mergeActionsOptions,
  normalizeConfig,
};
