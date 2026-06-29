import type { Socket } from "socket.io";

import type { CreateGitForgeSocketServerOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { authorizationAllowed, serializeError, statusForError } from "#oul7o8qvkv5n";
import type { NormalizedGitHostLogger } from "#1mbdfxwwqqpa";

import {
  ACTIONS_RUN_DONE_EVENT,
  ACTIONS_RUN_ERROR_EVENT,
  ACTIONS_RUN_EVENT,
} from "#e1ead083c558";

function isTerminalRunEventType(value: string) {
  return value === "run.cancelled" || value === "run.failed" || value === "run.finished";
}

function emitMissingRunIdentity(socket: Socket) {
  socket.emit(ACTIONS_RUN_ERROR_EVENT, {
    error: {
      code: "forge_resource_not_found",
      message: "repositoryKey and runId are required.",
    },
    status: 404,
  });
  socket.emit(ACTIONS_RUN_DONE_EVENT, { ok: false });
  socket.disconnect();
}

function emitMissingRepository(socket: Socket, repositoryKey: string) {
  socket.emit(ACTIONS_RUN_ERROR_EVENT, {
    error: {
      code: "repository_not_found",
      message: "Repository not found.",
    },
    status: 404,
  });
  socket.emit(ACTIONS_RUN_DONE_EVENT, { ok: false, repository_key: repositoryKey });
  socket.disconnect();
}

async function authorizeRunSocket(
  options: CreateGitForgeSocketServerOptions,
  socket: Socket,
  pathname: string,
  repositoryId: string,
  repositoryKey: string,
  runId: string,
  afterSequence: number,
) {
  const actor = options.resolveActor ? await options.resolveActor(socket.request) : null;
  const searchParams = new URLSearchParams();
  if (afterSequence > 0) searchParams.set("afterSequence", String(afterSequence));
  return authorizationAllowed(options.authorize
    ? await options.authorize({
      action: "action_run",
      actor,
      method: "SOCKET",
      operation: "subscribe",
      pathname,
      remoteAddress: text(socket.handshake.address),
      repositoryId,
      repositoryKey,
      request: socket.request,
      resource: "action_run",
      runId,
      searchParams,
    })
    : undefined);
}

function emitDeniedRunSocket(
  socket: Socket,
  repositoryId: string,
  repositoryKey: string,
  runId: string,
  status: number,
  message: string,
) {
  socket.emit(ACTIONS_RUN_ERROR_EVENT, {
    error: {
      code: "permission_denied",
      message,
    },
    status,
  });
  socket.emit(ACTIONS_RUN_DONE_EVENT, {
    ok: false,
    repository_id: repositoryId,
    repository_key: repositoryKey,
    run_id: runId,
  });
  socket.disconnect();
}

function emitCompletedRunSocket(socket: Socket, repositoryId: string, repositoryKey: string, runId: string) {
  socket.emit(ACTIONS_RUN_DONE_EVENT, {
    ok: true,
    repository_id: repositoryId,
    repository_key: repositoryKey,
    run_id: runId,
  });
}

function runIsTerminal(status: string) {
  return status === "cancelled" || status === "failed" || status === "skipped" || status === "success";
}

function logDeniedRunSocket(
  logger: NormalizedGitHostLogger,
  logGroup: string,
  pathname: string,
  repositoryId: string,
  repositoryKey: string,
  runId: string,
  status: number,
) {
  logger.warn(logGroup, "forge socket permission denied", {
    action: "action_run",
    pathname,
    repositoryId,
    repositoryKey,
    runId,
    status,
  });
}

function logSubscribedRunSocket(
  logger: NormalizedGitHostLogger,
  logGroup: string,
  repositoryId: string,
  repositoryKey: string,
  runId: string,
  socketId: string,
) {
  logger.info(logGroup, "forge action run socket subscribed", {
    repositoryId,
    repositoryKey,
    runId,
    socketId,
  });
}

function logFailedRunSocket(
  logger: NormalizedGitHostLogger,
  logGroup: string,
  repositoryId: string,
  repositoryKey: string,
  runId: string,
  socketId: string,
  error: unknown,
) {
  logger.error(logGroup, "forge action run socket failed", {
    error: error instanceof Error ? error.message : String(error),
    repositoryId,
    repositoryKey,
    runId,
    socketId,
  });
}

function emitFailedRunSocket(
  socket: Socket,
  repositoryId: string,
  repositoryKey: string,
  runId: string,
  error: unknown,
) {
  socket.emit(ACTIONS_RUN_ERROR_EVENT, {
    ...serializeError(error),
    ok: false,
    repository_id: repositoryId,
    repository_key: repositoryKey,
    run_id: runId,
    status: statusForError(error),
  });
  socket.emit(ACTIONS_RUN_DONE_EVENT, {
    ok: false,
    repository_id: repositoryId,
    repository_key: repositoryKey,
    run_id: runId,
  });
  socket.disconnect();
}

async function replayRunEvents(
  options: CreateGitForgeSocketServerOptions,
  socket: Socket,
  repositoryId: string,
  runId: string,
  afterSequence: number,
) {
  const events = await options.forge.listWorkflowRunEvents(repositoryId, runId, {
    afterSequence,
  });
  for (const event of events) {
    socket.emit(ACTIONS_RUN_EVENT, event);
  }
}

async function subscribeToLiveRun(
  options: CreateGitForgeSocketServerOptions,
  socket: Socket,
  repositoryId: string,
  repositoryKey: string,
  runId: string,
) {
  let subscription: { close: () => void } | null = null;
  subscription = options.forge.subscribeWorkflowRun(repositoryId, runId, async (event) => {
    socket.emit(ACTIONS_RUN_EVENT, event);
    if (isTerminalRunEventType(event.type)) {
      emitCompletedRunSocket(socket, repositoryId, repositoryKey, runId);
      subscription?.close();
      socket.disconnect();
    }
  });
  socket.on("disconnect", () => {
    subscription?.close();
  });
}

async function resolveRunSubscriptionContext(
  options: CreateGitForgeSocketServerOptions,
  socket: Socket,
  basePath: string,
  payload?: { afterSequence?: number; repositoryKey?: string; runId?: string },
) {
  const repositoryKey = text(payload?.repositoryKey);
  const runId = text(payload?.runId);
  const afterSequence = Number(payload?.afterSequence) || 0;
  if (!repositoryKey || !runId) return null;
  const repositoryId = text(options.resolveRepositoryId
    ? await options.resolveRepositoryId(repositoryKey, socket.request)
    : repositoryKey);
  return {
    afterSequence,
    pathname: `${basePath.replace(/\/+$/g, "") || ""}/repositories/${encodeURIComponent(repositoryKey)}/actions/runs/${encodeURIComponent(runId)}/socket`,
    repositoryId,
    repositoryKey,
    runId,
  };
}

async function runAuthorizedSubscription(
  options: CreateGitForgeSocketServerOptions,
  socket: Socket,
  context: {
    afterSequence: number;
    pathname: string;
    repositoryId: string;
    repositoryKey: string;
    runId: string;
  },
  verbose: boolean,
  logger: NormalizedGitHostLogger,
  logGroup: string,
) {
  const auth = await authorizeRunSocket(
    options,
    socket,
    context.pathname,
    context.repositoryId,
    context.repositoryKey,
    context.runId,
    context.afterSequence,
  );
  if (!auth.allowed) {
    const status = auth.status || 403;
    logDeniedRunSocket(logger, logGroup, context.pathname, context.repositoryId, context.repositoryKey, context.runId, status);
    emitDeniedRunSocket(socket, context.repositoryId, context.repositoryKey, context.runId, status, auth.message || "Permission denied.");
    return;
  }

  try {
    await replayRunEvents(options, socket, context.repositoryId, context.runId, context.afterSequence);
    const run = await options.forge.readWorkflowRun(context.repositoryId, context.runId);
    if (runIsTerminal(run.status)) {
      emitCompletedRunSocket(socket, context.repositoryId, context.repositoryKey, context.runId);
      socket.disconnect();
      return;
    }

    await subscribeToLiveRun(options, socket, context.repositoryId, context.repositoryKey, context.runId);
    if (verbose) {
      logSubscribedRunSocket(logger, logGroup, context.repositoryId, context.repositoryKey, context.runId, socket.id);
    }
  } catch (error) {
    logFailedRunSocket(logger, logGroup, context.repositoryId, context.repositoryKey, context.runId, socket.id, error);
    emitFailedRunSocket(socket, context.repositoryId, context.repositoryKey, context.runId, error);
  }
}

function createRunSubscriptionHandler(
  options: CreateGitForgeSocketServerOptions,
  logger: NormalizedGitHostLogger,
  logGroup: string,
  basePath: string,
  verbose: boolean,
) {
  return async function handleRunSubscription(
    socket: Socket,
    payload?: { afterSequence?: number; repositoryKey?: string; runId?: string },
  ) {
    const context = await resolveRunSubscriptionContext(options, socket, basePath, payload);
    if (!context) {
      emitMissingRunIdentity(socket);
      return;
    }
    if (!context.repositoryId) {
      emitMissingRepository(socket, context.repositoryKey);
      return;
    }
    await runAuthorizedSubscription(options, socket, context as typeof context & { repositoryId: string }, verbose, logger, logGroup);
  };
}

export { createRunSubscriptionHandler };
