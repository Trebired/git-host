import { GitHostError } from "#8974ac53d713";
import type {
  GitForge,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  RunGitForgeWorkflowInput,
  CancelGitForgeWorkflowRunInput,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import { assertActor } from "./shared.js";
import type { GitForgeRuntimeContext } from "./context.js";

function requireActions(context: GitForgeRuntimeContext, message: string) {
  if (!context.actions) throw new GitHostError("forge_actions_not_configured", message);
  return context.actions;
}

function createBaseMethods(context: GitForgeRuntimeContext): Pick<GitForge,
  "cancelWorkflowRun" | "listActivity" | "listWorkflowRunArtifacts" | "listWorkflowRunEvents" | "listWorkflowRunJobs" | "listWorkflowRunSteps" | "listWorkflowRuns" | "listWorkflows" | "readOverview" | "readSocialState" | "readWorkflow" | "readWorkflowRun" | "runWorkflow" | "subscribeWorkflowRun"
> {
  return {
    async readOverview(repositoryId, input = {}) {
      return await context.readOverview(repositoryId, text(input.actorId));
    },
    async readSocialState(repositoryId, input = {}) {
      return await context.readSocialState(repositoryId, text(input.actorId));
    },
    async listWorkflows(repositoryId: string, filters: GitForgeWorkflowFilters = {}) {
      return context.actions ? await context.actions.listWorkflows(repositoryId, filters) : [];
    },
    async readWorkflow(repositoryId: string, workflowId: string) {
      return await requireActions(context, "Actions storage is required to read workflows.").readWorkflow(repositoryId, workflowId);
    },
    async runWorkflow(repositoryId: string, workflowId: string, input: RunGitForgeWorkflowInput) {
      return await requireActions(context, "Actions storage is required to run workflows.").runWorkflow(repositoryId, workflowId, {
        ...input,
        actor: assertActor(input.actor),
      });
    },
    async cancelWorkflowRun(repositoryId: string, runId: string, input: CancelGitForgeWorkflowRunInput) {
      return await requireActions(context, "Actions storage is required to cancel workflow runs.").cancelWorkflowRun(repositoryId, runId, assertActor(input.actor));
    },
    async listWorkflowRuns(repositoryId: string, filters: GitForgeWorkflowRunFilters = {}) {
      return context.actions ? await context.actions.listWorkflowRuns(repositoryId, filters) : [];
    },
    async readWorkflowRun(repositoryId: string, runId: string) {
      return await requireActions(context, "Actions storage is required to read workflow runs.").readWorkflowRun(repositoryId, runId);
    },
    async listWorkflowRunSteps(repositoryId: string, runId: string, filters = {}) {
      return context.actions ? await context.actions.listWorkflowRunSteps(repositoryId, runId, filters) : [];
    },
    async listWorkflowRunJobs(repositoryId: string, runId: string, filters = {}) {
      return context.actions?.listWorkflowRunJobs ? await context.actions.listWorkflowRunJobs(repositoryId, runId, filters) : [];
    },
    async listWorkflowRunArtifacts(repositoryId: string, runId: string, filters = {}) {
      return context.actions?.listWorkflowRunArtifacts ? await context.actions.listWorkflowRunArtifacts(repositoryId, runId, filters) : [];
    },
    async listWorkflowRunEvents(repositoryId: string, runId: string, filters: GitForgeWorkflowRunEventFilters = {}) {
      return context.actions ? await context.actions.listWorkflowRunEvents(repositoryId, runId, filters) : [];
    },
    subscribeWorkflowRun(repositoryId: string, runId: string, listener) {
      return context.actions ? context.actions.subscribeWorkflowRun(repositoryId, runId, listener) : { close() {} };
    },
    async listActivity(repositoryId: string, filters = {}) {
      return await context.activityRecorder.listActivity(repositoryId, filters);
    },
  };
}

export { createBaseMethods };
