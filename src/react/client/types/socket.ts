import type {
  GitForgeWorkflowRunEvent,
  GitLinguistProgressEvent,
  GitRepositoryLinguist,
} from "#1mbdfxwwqqpa";

type GitLinguistSocketProgressEvent = {
  progress: GitLinguistProgressEvent;
  type: "progress";
};

type GitLinguistSocketResultEvent = {
  action: "linguist";
  data: GitRepositoryLinguist;
  repository_id: string;
  repository_key: string;
  type: "result";
};

type GitLinguistSocketErrorEvent = {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  status?: number;
  type: "error";
};

type GitLinguistSocketDoneEvent = {
  ok: boolean;
  repository_id?: string;
  repository_key?: string;
  type: "done";
};

type GitLinguistSocketEvent =
  | GitLinguistSocketDoneEvent
  | GitLinguistSocketErrorEvent
  | GitLinguistSocketProgressEvent
  | GitLinguistSocketResultEvent;

type GitWorkflowRunSocketDoneEvent = {
  ok: boolean;
  repository_id?: string;
  repository_key?: string;
  run_id?: string;
  type: "done";
};

type GitWorkflowRunSocketErrorEvent = {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  repository_id?: string;
  repository_key?: string;
  run_id?: string;
  status?: number;
  type: "error";
};

type GitWorkflowRunSocketEvent =
  | GitWorkflowRunSocketDoneEvent
  | GitWorkflowRunSocketErrorEvent
  | (GitForgeWorkflowRunEvent & { type: GitForgeWorkflowRunEvent["type"] });

export type {
  GitLinguistSocketDoneEvent,
  GitLinguistSocketErrorEvent,
  GitLinguistSocketEvent,
  GitLinguistSocketProgressEvent,
  GitLinguistSocketResultEvent,
  GitWorkflowRunSocketDoneEvent,
  GitWorkflowRunSocketErrorEvent,
  GitWorkflowRunSocketEvent,
};
