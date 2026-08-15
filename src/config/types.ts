import type { CreateGitForgeActionsOptions } from "#14021226ec9b";

type GitHostConfig = {
  actions?: CreateGitForgeActionsOptions;
  forVersion?: string;
};

type NormalizedGitHostConfig = {
  actions: CreateGitForgeActionsOptions;
  forVersion: string;
};

type LoadedGitHostConfig = {
  config: NormalizedGitHostConfig;
  configPath: string | null;
  dependencies: string[];
};

type LoadGitHostConfigOptions = {
  configPath?: string;
  defaultIfMissing?: boolean;
  searchFrom?: string;
};

export type {
  GitHostConfig,
  LoadGitHostConfigOptions,
  LoadedGitHostConfig,
  NormalizedGitHostConfig,
};
