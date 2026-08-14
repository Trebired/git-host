export {
  defineConfig,
  mergeActionsOptions,
  normalizeConfig,
} from "./normalize.js";
export {
  GIT_HOST_PROJECT_CONFIG_PATH,
  findConfig,
  findConfigSync,
  loadCachedConfigSync,
  loadConfig,
  loadConfigSync,
  resetConfigCacheForTests,
} from "./load.js";

export type {
  GitHostConfig,
  LoadGitHostConfigOptions,
  LoadedGitHostConfig,
  NormalizedGitHostConfig,
} from "./types.js";
