import type { GitForge } from "#3c8d8166992a";
import { assertActor } from "./shared.js";
import type { GitForgeRuntimeContext } from "./context.js";

function createSocialMethods(context: GitForgeRuntimeContext): Pick<GitForge, "starRepository" | "unstarRepository" | "watchRepository" | "unwatchRepository"> {
  return {
    async starRepository(repositoryId, input) {
      const actor = assertActor(input.actor);
      await context.options.storage.social.setStar(repositoryId, actor.id, true);
      await context.recordActivity(repositoryId, actor, "star", {});
      return await context.readSocialState(repositoryId, actor.id);
    },
    async unstarRepository(repositoryId, input) {
      const actor = assertActor(input.actor);
      await context.options.storage.social.setStar(repositoryId, actor.id, false);
      await context.recordActivity(repositoryId, actor, "unstar", {});
      return await context.readSocialState(repositoryId, actor.id);
    },
    async watchRepository(repositoryId, input) {
      const actor = assertActor(input.actor);
      await context.options.storage.social.setWatching(repositoryId, actor.id, true);
      await context.recordActivity(repositoryId, actor, "watch", {});
      return await context.readSocialState(repositoryId, actor.id);
    },
    async unwatchRepository(repositoryId, input) {
      const actor = assertActor(input.actor);
      await context.options.storage.social.setWatching(repositoryId, actor.id, false);
      await context.recordActivity(repositoryId, actor, "unwatch", {});
      return await context.readSocialState(repositoryId, actor.id);
    },
  };
}

export { createSocialMethods };
