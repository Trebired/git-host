import {
  DEFAULT_ACTOR_EMAIL,
  DEFAULT_ACTOR_NAME,
} from "#r89qhx6c8mkf";
import type { GitActor } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

function buildGitEnv(options: {
  actor?: GitActor | null;
  extraEnv?: Record<string, string>;
} = {}): Record<string, string> {
  const actor = options.actor || null;
  const extraEnv = options.extraEnv || {};
  const name = text(actor && actor.name, DEFAULT_ACTOR_NAME);
  const email = text(actor && actor.email, DEFAULT_ACTOR_EMAIL);

  return {
    ...process.env,
    ...extraEnv,
    GIT_AUTHOR_EMAIL: email,
    GIT_AUTHOR_NAME: name,
    GIT_COMMITTER_EMAIL: email,
    GIT_COMMITTER_NAME: name,
  } as Record<string, string>;
}

export { buildGitEnv };
