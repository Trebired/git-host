import { buildPackageLogGroup, PACKAGE_NAME } from "./package-metadata.js";

const DEFAULT_BRANCH = "main";
const DEFAULT_COMMIT_MESSAGE = "Initial import";
const DEFAULT_ACTOR_NAME = PACKAGE_NAME;
const DEFAULT_ACTOR_EMAIL = "noreply@git-host.local";
const DEFAULT_MANAGED_EXCLUDE_HEADER = `# Managed by ${PACKAGE_NAME}`;
const GIT_HOST_LOG_GROUP = buildPackageLogGroup();
const GIT_HOST_PACKAGE_NAME = PACKAGE_NAME;

const DEFAULT_MANAGED_EXCLUDE_PATTERNS = Object.freeze([
    "node_modules/",
    ".DS_Store",
    "dist/",
    "coverage/",
    ".turbo/",
    ".next/",
    ".svelte-kit/",
]);

function buildGitHostLogGroup(...parts: string[]): string {
  return buildPackageLogGroup(...parts);
}

export {
  buildGitHostLogGroup,
  DEFAULT_ACTOR_EMAIL,
  DEFAULT_ACTOR_NAME,
  DEFAULT_BRANCH,
  DEFAULT_COMMIT_MESSAGE,
  DEFAULT_MANAGED_EXCLUDE_HEADER,
  DEFAULT_MANAGED_EXCLUDE_PATTERNS,
  GIT_HOST_LOG_GROUP,
  GIT_HOST_PACKAGE_NAME,
};
