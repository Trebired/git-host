import type { GitForgeActor } from "#rifbqbjmjgxy";

type GitForgeWorkflowTriggerKind =
  | "manual"
  | "push"
  | "release.create"
  | "release.update"
  | "tag.create"
  | (string & {});

type GitForgeWorkflowSchema = "gha-subset-v1" | "legacy-shell-v1";

type GitForgeWorkflowDispatchInputType = "boolean" | "string";

type GitForgeWorkflowDispatchInput = {
  default?: boolean | string;
  description?: string;
  name: string;
  required?: boolean;
  type: GitForgeWorkflowDispatchInputType;
};

type GitForgeWorkflowDispatchTrigger = {
  inputs?: GitForgeWorkflowDispatchInput[];
};

type GitForgeWorkflowPushTrigger = {
  branches?: string[];
  tags?: string[];
};

type GitForgeWorkflowTriggers = {
  push?: GitForgeWorkflowPushTrigger;
  workflow_dispatch?: GitForgeWorkflowDispatchTrigger;
};

type GitForgeWorkflowPermissions = Record<string, string>;

type GitForgeWorkflowConcurrency = {
  cancel_in_progress?: boolean;
  group: string;
};

type GitForgeWorkflowStep = {
  env?: Record<string, string>;
  id?: string;
  kind?: "shell";
  name: string;
  run: string;
  shell?: string;
};

type GitForgeWorkflowJobStep = {
  env?: Record<string, string>;
  id?: string;
  if?: string;
  kind?: "shell" | "uses";
  name?: string;
  run?: string;
  shell?: string;
  uses?: string;
  with?: Record<string, boolean | number | string>;
};

type GitForgeWorkflowJobMatrix = {
  include?: Array<Record<string, boolean | number | string>>;
  values: Record<string, Array<boolean | number | string>>;
};

type GitForgeWorkflowJobStrategy = {
  matrix?: GitForgeWorkflowJobMatrix;
};

type GitForgeWorkflowJob = {
  env?: Record<string, string>;
  id: string;
  if?: string;
  name: string;
  needs?: string[];
  runs_on: string[];
  steps: GitForgeWorkflowJobStep[];
  strategy?: GitForgeWorkflowJobStrategy;
};

type GitForgeWorkflowSource = {
  branches?: string[];
  env?: Record<string, string>;
  tags?: string[];
};

type GitForgeWorkflow = {
  concurrency?: GitForgeWorkflowConcurrency;
  definition_path: string;
  enabled: boolean;
  env?: Record<string, string>;
  id: string;
  jobs: GitForgeWorkflowJob[];
  name: string;
  on?: GitForgeWorkflowTriggers;
  origin: "file";
  permissions?: GitForgeWorkflowPermissions;
  repository_id: string;
  schema: GitForgeWorkflowSchema;
  slug: string;
  source?: GitForgeWorkflowSource;
  steps: GitForgeWorkflowStep[];
  supported_uses: string[];
  trigger: GitForgeWorkflowTriggerKind;
};

type CreateGitForgeWorkflowInput = {
  actor: GitForgeActor;
  enabled?: boolean;
  env?: Record<string, string>;
  jobs?: GitForgeWorkflowJob[];
  name: string;
  on?: GitForgeWorkflowTriggers;
  permissions?: GitForgeWorkflowPermissions;
  slug?: string;
  source?: GitForgeWorkflowSource;
  steps?: GitForgeWorkflowStep[];
  trigger?: GitForgeWorkflowTriggerKind;
};

type UpdateGitForgeWorkflowInput = {
  actor: GitForgeActor;
  enabled?: boolean;
  env?: Record<string, string>;
  jobs?: GitForgeWorkflowJob[];
  name?: string;
  on?: GitForgeWorkflowTriggers;
  permissions?: GitForgeWorkflowPermissions;
  slug?: string;
  source?: GitForgeWorkflowSource;
  steps?: GitForgeWorkflowStep[];
  trigger?: GitForgeWorkflowTriggerKind;
};

export type {
  CreateGitForgeWorkflowInput,
  GitForgeWorkflow,
  GitForgeWorkflowConcurrency,
  GitForgeWorkflowDispatchInput,
  GitForgeWorkflowDispatchInputType,
  GitForgeWorkflowDispatchTrigger,
  GitForgeWorkflowJob,
  GitForgeWorkflowJobMatrix,
  GitForgeWorkflowJobStep,
  GitForgeWorkflowJobStrategy,
  GitForgeWorkflowPermissions,
  GitForgeWorkflowPushTrigger,
  GitForgeWorkflowSchema,
  GitForgeWorkflowSource,
  GitForgeWorkflowStep,
  GitForgeWorkflowTriggers,
  GitForgeWorkflowTriggerKind,
  UpdateGitForgeWorkflowInput,
};
