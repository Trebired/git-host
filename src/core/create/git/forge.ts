import type { CreateGitForgeOptions, GitForge } from "#1mbdfxwwqqpa";
import { createGitForgeContext } from "./forge/context.js";
import { createBaseMethods } from "./forge/base_methods.js";
import { createSocialMethods } from "./forge/social_methods.js";
import { createReleaseMethods } from "./forge/release_methods.js";
import { createForkMethods } from "./forge/fork_methods.js";

function createGitForge(options: CreateGitForgeOptions): GitForge {
  const context = createGitForgeContext(options);
  return {
    ...createBaseMethods(context),
    ...createSocialMethods(context),
    ...createReleaseMethods(context),
    ...createForkMethods(context),
  };
}

export { createGitForge };
