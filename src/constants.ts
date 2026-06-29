const DEFAULT_BRANCH = "main";
const DEFAULT_COMMIT_MESSAGE = "Initial import";
const DEFAULT_ACTOR_NAME = "@trebired/git-host";
const DEFAULT_ACTOR_EMAIL = "noreply@git-host.local";
const DEFAULT_MANAGED_EXCLUDE_HEADER = "# Managed by @trebired/git-host";

const DEFAULT_MANAGED_EXCLUDE_PATTERNS = Object.freeze([
  "node_modules/",
  ".DS_Store",
  "dist/",
  "coverage/",
  ".turbo/",
  ".next/",
  ".svelte-kit/",
]);

export {
  DEFAULT_ACTOR_EMAIL,
  DEFAULT_ACTOR_NAME,
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
  DEFAULT_MANAGED_EXCLUDE_HEADER,
  DEFAULT_MANAGED_EXCLUDE_PATTERNS,
};
