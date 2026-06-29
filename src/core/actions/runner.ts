import { executeGoRunner } from "./go_runner.js";
import { executeNodeRunner } from "./node_runner.js";
import { resolveRunnerLaunch } from "./runner/launch.js";
import type { ActionsRunnerExecution, ExecuteActionsRunnerInput } from "./types.js";
import { resolveActionsWorkspaceRoot } from "./workspace.js";

function executeActionsRunner(input: ExecuteActionsRunnerInput): ActionsRunnerExecution {
  const launch = resolveRunnerLaunch(input.actions);
  if (launch.kind === "go") {
    return executeGoRunner(input, launch);
  }
  return executeNodeRunner(input);
}

export {
  executeActionsRunner,
  resolveActionsWorkspaceRoot,
};

export type {
  ActionsRunnerEvent,
  ActionsRunnerExecution,
  ActionsRunnerHandle,
  ActionsRunnerInput,
  ExecuteActionsRunnerInput,
} from "./types.js";
