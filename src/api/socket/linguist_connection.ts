import type { Socket } from "socket.io";

import type {
  CreateGitApiSocketServerOptions,
  GitLinguistProgressEvent,
} from "#3c8d8166992a";
import { text } from "#62f869522d1f";
import { authorizationAllowed, serializeError, statusForError } from "#4e7ff1c92ff1";
import type { NormalizedGitHostLogger } from "#1mbdfxwwqqpa";

import {
  LINGUIST_DONE_EVENT,
  LINGUIST_ERROR_EVENT,
  LINGUIST_PROGRESS_EVENT,
  LINGUIST_RESULT_EVENT,
} from "./events.js";

function emitMissingRepositoryKey(socket: Socket) {
  socket.emit(LINGUIST_ERROR_EVENT, {
    error: {
      code: "repository_not_found",
      message: "Repository key is required.",
    },
    status: 404,
  });
  socket.emit(LINGUIST_DONE_EVENT, { ok: false });
  socket.disconnect();
}

function emitMissingRepositoryId(socket: Socket, repositoryKey: string) {
  socket.emit(LINGUIST_ERROR_EVENT, {
    error: {
      code: "repository_not_found",
      message: "Repository not found.",
    },
    status: 404,
  });
  socket.emit(LINGUIST_DONE_EVENT, { ok: false, repository_key: repositoryKey });
  socket.disconnect();
}

function emitDeniedSocket(
  socket: Socket,
  repositoryId: string,
  repositoryKey: string,
  status: number,
  message: string,
) {
  socket.emit(LINGUIST_ERROR_EVENT, {
    error: {
      code: "permission_denied",
      message,
    },
    status,
  });
  socket.emit(LINGUIST_DONE_EVENT, {
    ok: false,
    repository_id: repositoryId,
    repository_key: repositoryKey,
  });
  socket.disconnect();
}

async function authorizeLinguistSocket(
  options: CreateGitApiSocketServerOptions,
  socket: Socket,
  pathname: string,
  repositoryId: string,
  repositoryKey: string,
  ref: string,
) {
  const searchParams = new URLSearchParams();
  if (ref) searchParams.set("ref", ref);
  return authorizationAllowed(options.authorize
    ? await options.authorize({
      action: "linguist_socket",
      method: "SOCKET",
      pathname,
      remoteAddress: text(socket.handshake.address),
      repositoryId,
      repositoryKey,
      request: socket.request,
      searchParams,
    })
    : undefined);
}

function logDeniedSocket(
  logger: NormalizedGitHostLogger,
  logGroup: string,
  pathname: string,
  repositoryId: string,
  repositoryKey: string,
  status: number,
) {
  logger.warn(logGroup, "api socket permission denied", {
    action: "linguist_socket",
    pathname,
    repositoryId,
    repositoryKey,
    status,
  });
}

function emitLinguistResult(socket: Socket, repositoryId: string, repositoryKey: string, data: unknown) {
  socket.emit(LINGUIST_RESULT_EVENT, {
    action: "linguist",
    data,
    repository_id: repositoryId,
    repository_key: repositoryKey,
  });
  socket.emit(LINGUIST_DONE_EVENT, {
    ok: true,
    repository_id: repositoryId,
    repository_key: repositoryKey,
  });
}

function logCompletedSocket(
  logger: NormalizedGitHostLogger,
  logGroup: string,
  repositoryId: string,
  repositoryKey: string,
  socketId: string,
) {
  logger.info(logGroup, "api linguist socket completed", {
    repositoryId,
    repositoryKey,
    socketId,
  });
}

function logFailedSocket(
  logger: NormalizedGitHostLogger,
  logGroup: string,
  repositoryId: string,
  repositoryKey: string,
  socketId: string,
  error: unknown,
) {
  logger.error(logGroup, "api linguist socket failed", {
    error: error instanceof Error ? error.message : String(error),
    repositoryId,
    repositoryKey,
    socketId,
  });
}

function emitFailedSocket(socket: Socket, repositoryId: string, repositoryKey: string, error: unknown) {
  socket.emit(LINGUIST_ERROR_EVENT, {
    ...serializeError(error),
    ok: false,
    repository_id: repositoryId,
    repository_key: repositoryKey,
    status: statusForError(error),
  });
  socket.emit(LINGUIST_DONE_EVENT, {
    ok: false,
    repository_id: repositoryId,
    repository_key: repositoryKey,
  });
}

async function resolveLinguistContext(
  options: CreateGitApiSocketServerOptions,
  socket: Socket,
  basePath: string,
  payload?: { ref?: string; repositoryKey?: string },
) {
  const repositoryKey = text(payload?.repositoryKey);
  const ref = text(payload?.ref);
  if (!repositoryKey) return null;
  const repositoryId = text(options.resolveRepositoryId
    ? await options.resolveRepositoryId(repositoryKey, socket.request)
    : repositoryKey);
  return {
    pathname: `${basePath.replace(/\/+$/g, "") || ""}/repositories/${encodeURIComponent(repositoryKey)}/linguist/socket`,
    ref,
    repositoryId,
    repositoryKey,
  };
}

async function runLinguistSocket(
  options: CreateGitApiSocketServerOptions,
  socket: Socket,
  context: {
    pathname: string;
    ref: string;
    repositoryId: string;
    repositoryKey: string;
  },
  verbose: boolean,
  logger: NormalizedGitHostLogger,
  logGroup: string,
) {
  const auth = await authorizeLinguistSocket(
    options,
    socket,
    context.pathname,
    context.repositoryId,
    context.repositoryKey,
    context.ref,
  );
  if (!auth.allowed) {
    const status = auth.status || 403;
    logDeniedSocket(logger, logGroup, context.pathname, context.repositoryId, context.repositoryKey, status);
    emitDeniedSocket(socket, context.repositoryId, context.repositoryKey, status, auth.message || "Permission denied.");
    return;
  }

  try {
    const data = await options.gitHost.readLinguist(context.repositoryId, {
      onProgress(progressEvent: GitLinguistProgressEvent) {
        socket.emit(LINGUIST_PROGRESS_EVENT, progressEvent);
      },
      ref: context.ref,
    });
    emitLinguistResult(socket, context.repositoryId, context.repositoryKey, data);
    if (verbose) {
      logCompletedSocket(logger, logGroup, context.repositoryId, context.repositoryKey, socket.id);
    }
  } catch (error) {
    logFailedSocket(logger, logGroup, context.repositoryId, context.repositoryKey, socket.id, error);
    emitFailedSocket(socket, context.repositoryId, context.repositoryKey, error);
  } finally {
    socket.disconnect();
  }
}

function createLinguistConnectionHandler(
  options: CreateGitApiSocketServerOptions,
  logger: NormalizedGitHostLogger,
  logGroup: string,
  basePath: string,
  verbose: boolean,
) {
  return async function handleLinguistSocket(
    socket: Socket,
    payload?: { ref?: string; repositoryKey?: string },
  ) {
    const context = await resolveLinguistContext(options, socket, basePath, payload);
    if (!context) {
      emitMissingRepositoryKey(socket);
      return;
    }
    if (!context.repositoryId) {
      emitMissingRepositoryId(socket, context.repositoryKey);
      return;
    }
    await runLinguistSocket(options, socket, context as typeof context & { repositoryId: string }, verbose, logger, logGroup);
  };
}

export { createLinguistConnectionHandler };
