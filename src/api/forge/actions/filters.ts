import type {
  GitForgeActivityFilters,
  GitForgeWorkflowFilters,
  GitForgeWorkflowRunArtifactFilters,
  GitForgeWorkflowRunEventFilters,
  GitForgeWorkflowRunFilters,
  GitForgeWorkflowRunJobFilters,
  GitForgeWorkflowRunStepFilters,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

function readActivityFilters(searchParams: URLSearchParams): GitForgeActivityFilters {
  const kind = text(searchParams.get("kind"));
  const source = text(searchParams.get("source"));
  return {
    actor: text(searchParams.get("actor")),
    createdAfter: text(searchParams.get("createdAfter")),
    createdBefore: text(searchParams.get("createdBefore")),
    ...(kind ? { kind: kind.split(",").map((entry) => text(entry)).filter(Boolean) } : {}),
    ...(source ? { source: source.split(",").map((entry) => text(entry)).filter(Boolean) } : {}),
  };
}

function readWorkflowFilters(searchParams: URLSearchParams): GitForgeWorkflowFilters {
  const trigger = text(searchParams.get("trigger"));
  return {
    enabled: searchParams.has("enabled") ? text(searchParams.get("enabled")) === "true" : undefined,
    query: text(searchParams.get("query")),
    ...(trigger ? { trigger: trigger.split(",").map((entry) => text(entry)).filter(Boolean) } : {}),
  };
}

function readWorkflowRunFilters(searchParams: URLSearchParams): GitForgeWorkflowRunFilters {
  const status = text(searchParams.get("status"));
  const triggerKind = text(searchParams.get("triggerKind"));
  return {
    actor: text(searchParams.get("actor")),
    branch: text(searchParams.get("branch")),
    createdAfter: text(searchParams.get("createdAfter")),
    createdBefore: text(searchParams.get("createdBefore")),
    query: text(searchParams.get("query")),
    ref: text(searchParams.get("ref")),
    ...(status ? { status: status.split(",").map((entry) => text(entry)).filter(Boolean) as GitForgeWorkflowRunFilters["status"] } : {}),
    ...(triggerKind ? { triggerKind: triggerKind.split(",").map((entry) => text(entry)).filter(Boolean) as GitForgeWorkflowRunFilters["triggerKind"] } : {}),
    workflowId: text(searchParams.get("workflowId")),
  };
}

function readWorkflowRunEventFilters(searchParams: URLSearchParams): GitForgeWorkflowRunEventFilters {
  return {
    afterSequence: searchParams.has("afterSequence") ? Number(searchParams.get("afterSequence")) || 0 : undefined,
    limit: searchParams.has("limit") ? Number(searchParams.get("limit")) || undefined : undefined,
  };
}

function readWorkflowRunJobFilters(searchParams: URLSearchParams): GitForgeWorkflowRunJobFilters {
  const status = text(searchParams.get("status"));
  return {
    jobId: text(searchParams.get("jobId")),
    ...(status ? { status: status.split(",").map((entry) => text(entry)).filter(Boolean) as GitForgeWorkflowRunJobFilters["status"] } : {}),
  };
}

function readWorkflowRunStepFilters(searchParams: URLSearchParams): GitForgeWorkflowRunStepFilters {
  const status = text(searchParams.get("status"));
  return {
    jobRunId: text(searchParams.get("jobRunId")),
    ...(status ? { status: status.split(",").map((entry) => text(entry)).filter(Boolean) as GitForgeWorkflowRunStepFilters["status"] } : {}),
  };
}

function readWorkflowRunArtifactFilters(searchParams: URLSearchParams): GitForgeWorkflowRunArtifactFilters {
  return {
    jobRunId: text(searchParams.get("jobRunId")),
    name: text(searchParams.get("name")),
  };
}

export {
  readActivityFilters,
  readWorkflowFilters,
  readWorkflowRunArtifactFilters,
  readWorkflowRunEventFilters,
  readWorkflowRunFilters,
  readWorkflowRunJobFilters,
  readWorkflowRunStepFilters,
};
