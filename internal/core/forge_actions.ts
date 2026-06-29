import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { GitHostError } from "#8974ac53d713";
import type {
  CreateGitForgeActionsOptions,
  CreateGitForgeOptions,
  GitForgeActivityEntry,
  GitForgeActor,
  GitForgeActionsStorage,
  GitForgeWorkflow,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunStatus,
  GitForgeWorkflowRunStep,
  GitForgeWorkflowRunStepStatus,
  GitForgeWorkflowTriggerKind,
  MaybePromise,
  RunGitForgeWorkflowInput,
  UpdateGitForgeWorkflowInput,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { runGit } from "./run_git.js";

const ACTIVITY_LISTENER_SYMBOL = Symbol.for("@trebired/git-host/actions-activity-listeners");
const ACTIVITY_WRAPPED_SYMBOL = Symbol.for("@trebired/git-host/actions-activity-wrapped");
const OUTPUT_PREVIEW_LIMIT = 4000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000;
const TERMINAL_RUN_STATUSES = new Set<GitForgeWorkflowRunStatus>(["cancelled", "failed", "skipped", "success"]);

type WorkflowRunListener = (event: GitForgeWorkflowRunEvent) => MaybePromise<void>;

type CreateGitForgeActionsRuntimeOptions = {
  actions: CreateGitForgeActionsOptions | undefined;
  gitHost: CreateGitForgeOptions["gitHost"];
  releases: CreateGitForgeOptions["storage"]["releases"];
  storage: GitForgeActionsStorage;
};

type WorkflowQueueItem = {
  repositoryId: string;
  runId: string;
};

type ActiveRunState = {
  cancelRequested: boolean;
  child?: ReturnType<typeof spawn>;
  heartbeat?: NodeJS.Timeout;
  workspacePath?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  const next = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return next || "workflow";
}

function normalizeEnv(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const next = Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [text(key), text(entry)] as const)
      .filter(([key, entry]) => key && entry),
  );
  return Object.keys(next).length ? next : undefined;
}

function normalizeSteps(steps: GitForgeWorkflow["steps"]): GitForgeWorkflow["steps"] {
  return (Array.isArray(steps) ? steps : []).map((step) => ({
    env: normalizeEnv(step.env),
    id: text(step.id, randomUUID()),
    kind: "shell" as const,
    name: text(step.name, "Step"),
    run: text(step.run),
    shell: text(step.shell),
  })).filter((step) => step.run);
}

function appendOutputPreview(current: string, chunk: string): string {
  const next = `${current}${chunk}`;
  return next.length <= OUTPUT_PREVIEW_LIMIT ? next : next.slice(-OUTPUT_PREVIEW_LIMIT);
}

function toDateSortValue(value: string | null | undefined): string {
  return text(value);
}

function matchesWorkflowTrigger(workflow: GitForgeWorkflow, triggerKind: GitForgeWorkflowTriggerKind, context: Record<string, unknown>) {
  if (!workflow.enabled || text(workflow.trigger) !== text(triggerKind)) return false;

  const branches = Array.isArray(workflow.source?.branches) ? workflow.source?.branches.map((entry) => text(entry)).filter(Boolean) : [];
  const tags = Array.isArray(workflow.source?.tags) ? workflow.source?.tags.map((entry) => text(entry)).filter(Boolean) : [];
  const branch = text(context.branch);
  const tag = text(context.tag_name, text(context.tag));

  if (branches.length && !branches.includes(branch)) return false;
  if (tags.length && !tags.includes(tag)) return false;
  return true;
}

function isTerminalRunStatus(status: GitForgeWorkflowRunStatus) {
  return TERMINAL_RUN_STATUSES.has(status);
}

function ensureActionsStorage(storage: GitForgeActionsStorage | undefined): GitForgeActionsStorage {
  if (!storage) {
    throw new GitHostError("forge_actions_not_configured", "Actions storage is required to use repository workflows.");
  }
  return storage;
}

function normalizeRunner(options: CreateGitForgeActionsOptions | undefined) {
  const runner = options?.runner || {};
  return {
    capabilities: Array.isArray(runner.capabilities) ? runner.capabilities.map((entry) => text(entry)).filter(Boolean) : ["shell", "snapshot", "streaming-logs"],
    host: text(runner.host, os.hostname()),
    id: text(runner.id, `local-${os.hostname()}`),
    kind: text(runner.kind, "local-host"),
    platform_version: text(runner.platform_version, "@trebired/git-host"),
  };
}

function createGitForgeActionsRuntime(options: CreateGitForgeActionsRuntimeOptions) {
  const storage = ensureActionsStorage(options.storage);
  const runListeners = new Map<string, Set<WorkflowRunListener>>();
  const runSequences = new Map<string, number>();
  const queuedRuns: WorkflowQueueItem[] = [];
  const activeRuns = new Map<string, ActiveRunState>();
  const runner = normalizeRunner(options.actions);
  let processing = false;

  async function nextRunSequence(runId: string): Promise<number> {
    const current = runSequences.get(runId);
    if (Number.isFinite(current)) {
      const next = Number(current) + 1;
      runSequences.set(runId, next);
      return next;
    }
    const existing = await storage.listWorkflowRunEvents(runId);
    const next = existing.length + 1;
    runSequences.set(runId, next);
    return next;
  }

  async function emitRunEvent(
    run: GitForgeWorkflowRun,
    input: Omit<GitForgeWorkflowRunEvent, "created_at" | "id" | "repository_id" | "run_id" | "sequence" | "workflow_id">,
  ) {
    const event = await storage.appendWorkflowRunEvent({
      ...input,
      created_at: nowIso(),
      id: randomUUID(),
      repository_id: run.repository_id,
      run_id: run.id,
      sequence: await nextRunSequence(run.id),
      workflow_id: run.workflow_id,
    });
    const listeners = Array.from(runListeners.get(run.id) || []);
    await Promise.all(listeners.map(async (listener) => {
      try {
        await listener(event);
      } catch {}
    }));
    return event;
  }

  async function readRepositoryPath(repositoryId: string) {
    const summary = await options.gitHost.readSummary(repositoryId);
    return summary.repository.path;
  }

  async function resolveCommit(repositoryPath: string, refInput: string) {
    const ref = text(refInput, "HEAD");
    const res = await runGit(["rev-parse", ref], { cwd: repositoryPath });
    if (!res.ok) {
      throw new GitHostError("git_command_failed", text(res.stderr, `Failed to resolve ref "${ref}".`), {
        ref,
        repositoryPath,
      });
    }
    return text(res.stdout);
  }

  async function resolveRunTarget(repositoryId: string, input: {
    branch?: string;
    commitHash?: string;
    ref?: string;
  }) {
    const summary = await options.gitHost.readSummary(repositoryId);
    const repositoryPath = summary.repository.path;
    const branch = text(input.branch, summary.repository.current_branch) || null;
    const ref = text(input.ref, branch || "HEAD");
    const commitHash = text(input.commitHash) || await resolveCommit(repositoryPath, ref);
    return {
      branch,
      commitHash,
      ref,
      repositoryPath,
    };
  }

  async function materializeRunWorkspace(run: GitForgeWorkflowRun) {
    const repositoryPath = await readRepositoryPath(run.repository_id);
    const root = path.join(text(options.actions?.workspaceRoot, path.join(os.tmpdir(), "@trebired-git-host-actions")), text(run.repository_id), run.id);
    const workspacePath = path.join(root, "workspace");
    fs.rmSync(root, { force: true, recursive: true });
    fs.mkdirSync(root, { recursive: true });

    const cloneRes = await runGit(["clone", "--no-checkout", repositoryPath, workspacePath], { cwd: root });
    if (!cloneRes.ok) {
      throw new GitHostError("git_command_failed", text(cloneRes.stderr, "Failed to materialize workflow workspace."), {
        repositoryId: run.repository_id,
        runId: run.id,
      });
    }

    const checkoutRes = await runGit(["checkout", "--detach", run.commit_hash], { cwd: workspacePath });
    if (!checkoutRes.ok) {
      throw new GitHostError("git_command_failed", text(checkoutRes.stderr, "Failed to check out workflow commit."), {
        commitHash: run.commit_hash,
        repositoryId: run.repository_id,
        runId: run.id,
      });
    }

    return workspacePath;
  }

  async function readRequiredWorkflow(repositoryId: string, workflowId: string) {
    const workflow = await storage.readWorkflow(repositoryId, workflowId);
    if (!workflow) {
      throw new GitHostError("forge_resource_not_found", `Workflow "${workflowId}" was not found.`, {
        repositoryId,
        workflowId,
      });
    }
    return workflow;
  }

  async function readRequiredRun(repositoryId: string, runId: string) {
    const run = await storage.readWorkflowRun(repositoryId, runId);
    if (!run) {
      throw new GitHostError("forge_resource_not_found", `Workflow run "${runId}" was not found.`, {
        repositoryId,
        runId,
      });
    }
    return run;
  }

  async function updateRun(repositoryId: string, runId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRun"]>[2]) {
    const run = await storage.updateWorkflowRun(repositoryId, runId, input);
    if (!run) {
      throw new GitHostError("forge_resource_not_found", `Workflow run "${runId}" was not found.`, {
        repositoryId,
        runId,
      });
    }
    return run;
  }

  async function updateRunStep(runId: string, stepId: string, input: Parameters<GitForgeActionsStorage["updateWorkflowRunStep"]>[2]) {
    const step = await storage.updateWorkflowRunStep(runId, stepId, input);
    if (!step) {
      throw new GitHostError("forge_resource_not_found", `Workflow run step "${stepId}" was not found.`, {
        runId,
        stepId,
      });
    }
    return step;
  }

  function scheduleQueueProcessing() {
    if (processing) return;
    queueMicrotask(() => {
      void processQueue();
    });
  }

  async function markQueuedSteps(runId: string, fromIndex: number, status: Extract<GitForgeWorkflowRunStepStatus, "cancelled" | "skipped">) {
    const steps = await storage.listWorkflowRunSteps(runId);
    const now = nowIso();
    await Promise.all(steps
      .filter((step) => step.index > fromIndex && step.status === "queued")
      .map((step) => storage.updateWorkflowRunStep(runId, step.id, {
        finished_at: now,
        status,
      })));
  }

  async function finalizeRun(run: GitForgeWorkflowRun, input: {
    currentStep?: string | null;
    currentStepIndex?: number | null;
    eventType: GitForgeWorkflowRunEvent["type"];
    status: GitForgeWorkflowRunStatus;
    summary: string;
  }) {
    const finished = await updateRun(run.repository_id, run.id, {
      current_step: input.currentStep === undefined ? null : input.currentStep,
      current_step_index: input.currentStepIndex === undefined ? null : input.currentStepIndex,
      finished_at: nowIso(),
      status: input.status,
      summary: input.summary,
    });
    await emitRunEvent(finished, {
      status: input.status,
      summary: input.summary,
      type: input.eventType,
    });
    return finished;
  }

  async function runShellStep(run: GitForgeWorkflowRun, workflow: GitForgeWorkflow, step: GitForgeWorkflowRunStep, workspacePath: string) {
    const active = activeRuns.get(run.id);
    if (!active) {
      throw new GitHostError("git_command_failed", "Workflow run is not active.", {
        runId: run.id,
      });
    }

    const startedStep = await updateRunStep(run.id, step.id, {
      started_at: nowIso(),
      status: "running",
    });
    const updatedRun = await updateRun(run.repository_id, run.id, {
      current_step: startedStep.name,
      current_step_index: startedStep.index,
      status: "running",
      summary: `Running ${startedStep.name}.`,
    });
    await emitRunEvent(updatedRun, {
      command: startedStep.command,
      status: "running",
      step_id: startedStep.id,
      step_index: startedStep.index,
      step_name: startedStep.name,
      type: "step.started",
    });

    let outputPreview = startedStep.output_preview;
    const shell = text(workflow.steps[startedStep.index]?.shell, text(options.actions?.shell, "bash"));
    const env = {
      ...process.env,
      ...(options.actions?.env || {}),
      ...(workflow.env || {}),
      ...(workflow.source?.env || {}),
      ...(workflow.steps[startedStep.index]?.env || {}),
      GIT_HOST_ACTIONS_REPOSITORY_ID: run.repository_id,
      GIT_HOST_ACTIONS_RUN_ID: run.id,
      GIT_HOST_ACTIONS_TRIGGER: text(run.trigger_kind),
      GIT_HOST_ACTIONS_WORKFLOW_ID: workflow.id,
      GIT_HOST_ACTIONS_COMMIT: run.commit_hash,
      GIT_HOST_ACTIONS_REF: run.ref,
      GIT_HOST_ACTIONS_BRANCH: text(run.branch),
      GIT_HOST_ACTIONS_RELEASE_ID: text(run.release_id),
    };

    const child = spawn(shell, ["-lc", startedStep.command], {
      cwd: workspacePath,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    active.child = child;
    active.heartbeat = setInterval(() => {
      void emitRunEvent(updatedRun, {
        status: "running",
        step_id: startedStep.id,
        step_index: startedStep.index,
        step_name: startedStep.name,
        type: "step.heartbeat",
      });
    }, Math.max(250, Number(options.actions?.heartbeatIntervalMs) || DEFAULT_HEARTBEAT_INTERVAL_MS));

    async function handleChunk(stream: "stderr" | "stdout", chunk: Buffer | string) {
      let textChunk = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (options.actions?.redactOutput) {
        textChunk = await options.actions.redactOutput({
          chunk: textChunk,
          run: updatedRun,
          step: startedStep,
          stream,
        });
      }
      outputPreview = appendOutputPreview(outputPreview, textChunk);
      await emitRunEvent(updatedRun, {
        chunk: textChunk,
        status: "running",
        step_id: startedStep.id,
        step_index: startedStep.index,
        step_name: startedStep.name,
        stream,
        type: "step.output",
      });
    }

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.stdout.on("data", (chunk) => {
        void handleChunk("stdout", chunk);
      });
      child.stderr.on("data", (chunk) => {
        void handleChunk("stderr", chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => resolve(Number(code) || 0));
    });

    if (active.heartbeat) clearInterval(active.heartbeat);
    active.child = undefined;
    active.heartbeat = undefined;

    const cancelled = active.cancelRequested === true;
    const finalStatus: GitForgeWorkflowRunStepStatus = cancelled
      ? "cancelled"
      : (exitCode === 0 ? "success" : "failed");
    const finishedStep = await updateRunStep(run.id, startedStep.id, {
      exit_code: exitCode,
      finished_at: nowIso(),
      output_preview: outputPreview,
      status: finalStatus,
    });
    await emitRunEvent(updatedRun, {
      command: finishedStep.command,
      metadata: {
        exit_code: exitCode,
      },
      status: finalStatus,
      step_id: finishedStep.id,
      step_index: finishedStep.index,
      step_name: finishedStep.name,
      summary: finalStatus === "success" ? `${finishedStep.name} completed.` : `${finishedStep.name} ${cancelled ? "cancelled" : "failed"}.`,
      type: "step.finished",
    });

    return {
      cancelled,
      exitCode,
      status: finalStatus,
    };
  }

  async function executeRun(repositoryId: string, runId: string) {
    let run = await readRequiredRun(repositoryId, runId);
    if (isTerminalRunStatus(run.status)) return run;

    run = await updateRun(repositoryId, runId, {
      runner,
      started_at: nowIso(),
      status: "starting",
      summary: "Preparing workflow workspace.",
    });
    await emitRunEvent(run, {
      metadata: {
        runner,
      },
      status: "starting",
      summary: run.summary,
      type: "run.status",
    });

    const workflow = await readRequiredWorkflow(repositoryId, run.workflow_id);
    const steps = await storage.listWorkflowRunSteps(run.id);
    const activeState: ActiveRunState = {
      cancelRequested: false,
    };
    activeRuns.set(run.id, activeState);

    try {
      activeState.workspacePath = await materializeRunWorkspace(run);
      run = await updateRun(repositoryId, run.id, {
        status: "running",
        summary: "Workflow run started.",
      });
      await emitRunEvent(run, {
        status: "running",
        summary: run.summary,
        type: "run.status",
      });

      for (const step of steps.sort((left, right) => left.index - right.index)) {
        if (activeState.cancelRequested) {
          await markQueuedSteps(run.id, step.index - 1, "cancelled");
          return await finalizeRun(run, {
            eventType: "run.cancelled",
            status: "cancelled",
            summary: "Workflow run cancelled.",
          });
        }

        const result = await runShellStep(run, workflow, step, activeState.workspacePath);
        if (result.cancelled) {
          await markQueuedSteps(run.id, step.index, "cancelled");
          return await finalizeRun(run, {
            eventType: "run.cancelled",
            status: "cancelled",
            summary: "Workflow run cancelled.",
          });
        }
        if (result.exitCode !== 0) {
          await markQueuedSteps(run.id, step.index, "skipped");
          return await finalizeRun(run, {
            eventType: "run.failed",
            status: "failed",
            summary: `Workflow run failed in step ${step.name}.`,
          });
        }
      }

      return await finalizeRun(run, {
        eventType: "run.finished",
        status: "success",
        summary: "Workflow run completed successfully.",
      });
    } catch (error) {
      await markQueuedSteps(run.id, -1, "skipped");
      return await finalizeRun(run, {
        eventType: activeState.cancelRequested ? "run.cancelled" : "run.failed",
        status: activeState.cancelRequested ? "cancelled" : "failed",
        summary: activeState.cancelRequested
          ? "Workflow run cancelled."
          : (error instanceof Error ? error.message : "Workflow run failed."),
      });
    } finally {
      if (activeState.heartbeat) clearInterval(activeState.heartbeat);
      if (activeState.child && !activeState.child.killed) {
        try { activeState.child.kill("SIGKILL"); } catch {}
      }
      activeRuns.delete(run.id);
    }
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      while (queuedRuns.length) {
        const next = queuedRuns.shift();
        if (!next) continue;
        const run = await storage.readWorkflowRun(next.repositoryId, next.runId);
        if (!run || isTerminalRunStatus(run.status)) continue;
        await executeRun(next.repositoryId, next.runId);
      }
    } finally {
      processing = false;
    }
  }

  async function queueWorkflowRun(
    repositoryId: string,
    workflow: GitForgeWorkflow,
    input: RunGitForgeWorkflowInput & {
      triggerKind: GitForgeWorkflowTriggerKind;
      releaseId?: string | null;
    },
  ) {
    const target = await resolveRunTarget(repositoryId, input);
    const createdAt = nowIso();
    const createdBy = text(input.actor.id, text(input.actor.name, "system"));
    const run = await storage.createWorkflowRun({
      branch: target.branch,
      commit_hash: target.commitHash,
      created_at: createdAt,
      created_by: createdBy,
      current_step: null,
      current_step_index: null,
      finished_at: null,
      id: randomUUID(),
      ref: target.ref,
      release_id: input.releaseId == null ? null : text(input.releaseId),
      repository_id: repositoryId,
      runner: null,
      started_at: null,
      status: "queued",
      summary: "Workflow run queued.",
      trigger_context: input.triggerContext,
      trigger_kind: input.triggerKind,
      workflow_id: workflow.id,
    });

    await Promise.all(workflow.steps.map(async (step, index) => {
      await storage.createWorkflowRunStep({
        command: step.run,
        exit_code: null,
        finished_at: null,
        id: randomUUID(),
        index,
        kind: "shell",
        metadata: step.env ? { env: step.env, shell: text(step.shell) } : (text(step.shell) ? { shell: text(step.shell) } : undefined),
        name: text(step.name, `Step ${index + 1}`),
        output_preview: "",
        run_id: run.id,
        started_at: null,
        status: "queued",
      });
    }));

    await emitRunEvent(run, {
      metadata: {
        branch: run.branch,
        ref: run.ref,
      },
      status: "queued",
      summary: run.summary,
      type: "run.accepted",
    });
    queuedRuns.push({
      repositoryId,
      runId: run.id,
    });
    scheduleQueueProcessing();
    return run;
  }

  async function enqueueWorkflowsForTrigger(
    repositoryId: string,
    triggerKind: GitForgeWorkflowTriggerKind,
    actor: GitForgeActor,
    context: Record<string, unknown>,
  ) {
    const workflows = await storage.listWorkflows(repositoryId, {
      enabled: true,
      trigger: triggerKind,
    } satisfies GitForgeWorkflowFilters);
    const createdRuns: GitForgeWorkflowRun[] = [];
    for (const workflow of workflows) {
      if (!matchesWorkflowTrigger(workflow, triggerKind, context)) continue;
      createdRuns.push(await queueWorkflowRun(repositoryId, workflow, {
        actor,
        branch: text(context.branch),
        commitHash: text(context.commit_hash, text(context.head_commit)),
        ref: text(context.ref, text(context.tag_name, text(context.branch, "HEAD"))),
        releaseId: text(context.release_id) || null,
        triggerContext: context,
        triggerKind,
      }));
    }
    return createdRuns;
  }

  async function handleActivity(entry: GitForgeActivityEntry) {
    const actor: GitForgeActor = {
      id: text(entry.actor_id, text(entry.actor_label, "system")),
      name: text(entry.actor_label, entry.actor_id),
    };

    if (entry.kind === "repository.push") {
      await enqueueWorkflowsForTrigger(entry.repository_id, "push", actor, {
        ...(entry.metadata || {}),
        activity_id: entry.id,
      });
      return;
    }

    if (entry.kind === "release.create" || entry.kind === "release.update") {
      const releaseId = text(entry.metadata?.release_id);
      const release = releaseId ? await options.releases.readRelease(entry.repository_id, releaseId) : null;
      const targetRef = text(release?.target_ref);
      const repositoryPath = await readRepositoryPath(entry.repository_id);
      const commitHash = targetRef ? await resolveCommit(repositoryPath, targetRef) : "";
      await enqueueWorkflowsForTrigger(entry.repository_id, entry.kind as "release.create" | "release.update", actor, {
        ...(entry.metadata || {}),
        activity_id: entry.id,
        commit_hash: commitHash,
        ref: text(release?.tag_name, targetRef),
        release_id: release?.id,
        tag_name: text(release?.tag_name, text(entry.metadata?.tag_name)),
      });
    }
  }

  function bindActivityStorage(activityStorage: CreateGitForgeOptions["storage"]["activity"]) {
    const store = activityStorage as typeof activityStorage & {
      [ACTIVITY_LISTENER_SYMBOL]?: Set<(entry: GitForgeActivityEntry) => Promise<void>>;
      [ACTIVITY_WRAPPED_SYMBOL]?: boolean;
    };
    if (!store[ACTIVITY_LISTENER_SYMBOL]) {
      store[ACTIVITY_LISTENER_SYMBOL] = new Set();
    }
    store[ACTIVITY_LISTENER_SYMBOL]!.add(async (entry) => {
      await handleActivity(entry);
    });

    if (store[ACTIVITY_WRAPPED_SYMBOL]) return;
    store[ACTIVITY_WRAPPED_SYMBOL] = true;
    const original = activityStorage.createActivity.bind(activityStorage);
    activityStorage.createActivity = async (input) => {
      const entry = await original(input);
      const listeners = Array.from(store[ACTIVITY_LISTENER_SYMBOL] || []);
      await Promise.all(listeners.map(async (listener) => {
        try {
          await listener(entry);
        } catch {}
      }));
      return entry;
    };
  }

  return {
    bindActivityStorage,
    async createWorkflow(repositoryId: string, input: {
      actor: GitForgeActor;
      enabled?: boolean;
      env?: Record<string, string>;
      name: string;
      slug?: string;
      source?: GitForgeWorkflow["source"];
      steps: GitForgeWorkflow["steps"];
      trigger: GitForgeWorkflowTriggerKind;
    }) {
      const workflow = await storage.createWorkflow({
        created_at: nowIso(),
        created_by: text(input.actor.id),
        enabled: input.enabled !== false,
        env: normalizeEnv(input.env),
        id: randomUUID(),
        name: text(input.name),
        repository_id: repositoryId,
        slug: text(input.slug, slugify(input.name)),
        source: input.source ? {
          branches: Array.isArray(input.source.branches) ? input.source.branches.map((entry) => text(entry)).filter(Boolean) : undefined,
          env: normalizeEnv(input.source.env),
          tags: Array.isArray(input.source.tags) ? input.source.tags.map((entry) => text(entry)).filter(Boolean) : undefined,
        } : undefined,
        steps: normalizeSteps(input.steps),
        trigger: text(input.trigger) as GitForgeWorkflowTriggerKind,
        updated_at: nowIso(),
        updated_by: text(input.actor.id),
      });
      return workflow;
    },

    async updateWorkflow(repositoryId: string, workflowId: string, input: UpdateGitForgeWorkflowInput) {
      const current = await readRequiredWorkflow(repositoryId, workflowId);
      const updated = await storage.updateWorkflow(repositoryId, workflowId, {
        ...(input.enabled != null ? { enabled: input.enabled === true } : {}),
        ...(input.env !== undefined ? { env: normalizeEnv(input.env) } : {}),
        ...(input.name !== undefined ? { name: text(input.name) } : {}),
        ...(input.slug !== undefined ? { slug: text(input.slug, current.slug) } : {}),
        ...(input.source !== undefined ? {
          source: {
            branches: Array.isArray(input.source?.branches) ? input.source?.branches.map((entry) => text(entry)).filter(Boolean) : undefined,
            env: normalizeEnv(input.source?.env),
            tags: Array.isArray(input.source?.tags) ? input.source?.tags.map((entry) => text(entry)).filter(Boolean) : undefined,
          },
        } : {}),
        ...(input.steps !== undefined ? { steps: normalizeSteps(input.steps) } : {}),
        ...(input.trigger !== undefined ? { trigger: text(input.trigger) as GitForgeWorkflowTriggerKind } : {}),
        updated_at: nowIso(),
        updated_by: text(input.actor.id),
      });
      if (!updated) {
        throw new GitHostError("forge_resource_not_found", `Workflow "${workflowId}" was not found.`, {
          repositoryId,
          workflowId,
        });
      }
      return updated;
    },

    async listWorkflows(repositoryId: string, filters?: GitForgeWorkflowFilters) {
      const entries = await storage.listWorkflows(repositoryId, filters);
      return Array.from(entries).sort((left, right) => text(left.name).localeCompare(text(right.name)) || text(left.slug).localeCompare(text(right.slug)));
    },

    async readWorkflow(repositoryId: string, workflowId: string) {
      return await readRequiredWorkflow(repositoryId, workflowId);
    },

    async runWorkflow(repositoryId: string, workflowId: string, input: RunGitForgeWorkflowInput) {
      const workflow = await readRequiredWorkflow(repositoryId, workflowId);
      return await queueWorkflowRun(repositoryId, workflow, {
        ...input,
        triggerKind: "manual",
      });
    },

    async cancelWorkflowRun(repositoryId: string, runId: string, actor: GitForgeActor) {
      const run = await readRequiredRun(repositoryId, runId);
      if (isTerminalRunStatus(run.status)) return run;
      const active = activeRuns.get(run.id);

      if (active) {
        active.cancelRequested = true;
        if (active.child && !active.child.killed) {
          try { active.child.kill("SIGTERM"); } catch {}
        }
        return await updateRun(repositoryId, runId, {
          summary: `Cancellation requested by ${text(actor.id)}.`,
        });
      }

      const cancelled = await updateRun(repositoryId, runId, {
        finished_at: nowIso(),
        status: "cancelled",
        summary: `Cancelled by ${text(actor.id)}.`,
      });
      await emitRunEvent(cancelled, {
        status: "cancelled",
        summary: cancelled.summary,
        type: "run.cancelled",
      });
      return cancelled;
    },

    async listWorkflowRuns(repositoryId: string, filters?: GitForgeWorkflowRunFilters) {
      return await storage.listWorkflowRuns(repositoryId, filters);
    },

    async readWorkflowRun(repositoryId: string, runId: string) {
      return await readRequiredRun(repositoryId, runId);
    },

    async listWorkflowRunSteps(repositoryId: string, runId: string) {
      await readRequiredRun(repositoryId, runId);
      return await storage.listWorkflowRunSteps(runId);
    },

    async listWorkflowRunEvents(repositoryId: string, runId: string, filters?: GitForgeWorkflowRunEventFilters) {
      await readRequiredRun(repositoryId, runId);
      return await storage.listWorkflowRunEvents(runId, filters);
    },

    subscribeWorkflowRun(repositoryId: string, runId: string, listener: WorkflowRunListener) {
      const key = `${repositoryId}:${runId}`;
      void key;
      let listeners = runListeners.get(runId);
      if (!listeners) {
        listeners = new Set();
        runListeners.set(runId, listeners);
      }
      listeners.add(listener);
      return {
        close() {
          listeners?.delete(listener);
          if (listeners && listeners.size === 0) {
            runListeners.delete(runId);
          }
        },
      };
    },
  };
}

export { createGitForgeActionsRuntime, isTerminalRunStatus };
