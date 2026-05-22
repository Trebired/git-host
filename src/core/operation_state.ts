import fs from "node:fs";
import path from "node:path";

import type { GitOperationState } from "../types.js";

function readRepositoryOperationState(workspaceRoot: string): GitOperationState {
  const gitDir = path.join(workspaceRoot, ".git");
  const exists = (name: string) => fs.existsSync(path.join(gitDir, name));

  if (exists("rebase-merge") || exists("rebase-apply")) {
    return {
      kind: "rebase",
      label: "Rebase in progress",
      in_progress: true,
      can_continue: true,
      can_abort: true,
    };
  }
  if (exists("MERGE_HEAD")) {
    return {
      kind: "merge",
      label: "Merge in progress",
      in_progress: true,
      can_continue: true,
      can_abort: true,
    };
  }
  if (exists("CHERRY_PICK_HEAD")) {
    return {
      kind: "cherry-pick",
      label: "Cherry-pick in progress",
      in_progress: true,
      can_continue: true,
      can_abort: true,
    };
  }
  if (exists("REVERT_HEAD")) {
    return {
      kind: "revert",
      label: "Revert in progress",
      in_progress: true,
      can_continue: true,
      can_abort: true,
    };
  }

  return {
    kind: "",
    label: "",
    in_progress: false,
    can_continue: false,
    can_abort: false,
  };
}

export { readRepositoryOperationState };
