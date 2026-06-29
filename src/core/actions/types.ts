import type { ChildProcess } from "node:child_process";

import type {
  CreateGitForgeActionsOptions,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunStep,
} from "#1mbdfxwwqqpa";

type ActionsRunnerInput = {
  branch: string;
  commit_hash: string;
  env?: Record<string, string>;
  heartbeat_interval_ms: number;
  ref: string;
  release_id: string;
  repository_id: string;
  repository_path: string;
  run_id: string;
  shell: string;
  steps: Array<{
    command: string;
    env?: Record<string, string>;
    id: string;
    index: number;
    name: string;
    shell?: string;
  }>;
  workflow_id: string;
  workspace_root: string;
};

type ActionsRunnerEvent =
  | {
      status: GitForgeWorkflowRun["status"];
      summary: string;
      type: "run.status";
    }
  | {
      command: string;
      step_id: string;
      step_index: number;
      step_name: string;
      type: "step.started";
    }
  | {
      chunk: string;
      step_id: string;
      step_index: number;
      step_name: string;
      stream: "stderr" | "stdout";
      type: "step.output";
    }
  | {
      step_id: string;
      step_index: number;
      step_name: string;
      type: "step.heartbeat";
    }
  | {
      exit_code: number;
      output_preview: string;
      status: GitForgeWorkflowRunStep["status"];
      step_id: string;
      step_index: number;
      step_name: string;
      summary: string;
      type: "step.finished";
    };

type ActionsRunnerHandle = Pick<ChildProcess, "kill" | "killed">;

type ActionsRunnerExecution = {
  child: ActionsRunnerHandle;
  completed: Promise<{
    cancelled: boolean;
    exitCode: number;
    lastStepIndex: number;
    lastStepName: string;
  }>;
};

type ExecuteActionsRunnerInput = {
  actions: CreateGitForgeActionsOptions | undefined;
  heartbeatIntervalMs: number;
  onEvent: (event: ActionsRunnerEvent) => Promise<void>;
  onRunnerError?: (chunk: string) => Promise<void>;
  repositoryPath: string;
  run: GitForgeWorkflowRun;
  steps: GitForgeWorkflowRunStep[];
  workspaceRoot: string;
};

type RunnerLaunch =
  | {
      args: string[];
      command: string;
      cwd?: string;
      kind: "go";
    }
  | {
      kind: "node";
    };

type RunnerStepState = {
  lastStepIndex: number;
  lastStepName: string;
};

export type {
  ActionsRunnerEvent,
  ActionsRunnerExecution,
  ActionsRunnerHandle,
  ActionsRunnerInput,
  ExecuteActionsRunnerInput,
  RunnerLaunch,
  RunnerStepState,
};
