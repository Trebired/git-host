import { io as connectSocket } from "socket.io-client";

import {
  LINGUIST_DONE_EVENT,
  LINGUIST_ERROR_EVENT,
  LINGUIST_PROGRESS_EVENT,
  LINGUIST_RESULT_EVENT,
  LINGUIST_START_EVENT,
} from "../api/socket_events.js";
import type {
  CreateGitApiClientOptions,
  GitApiClient,
  GitLinguistSocketDoneEvent,
  GitLinguistSocketErrorEvent,
  GitLinguistSocketEvent,
  GitLinguistSocketProgressEvent,
  GitLinguistSocketResultEvent,
  GitApiClientRequestOptions,
  GitApiResource,
  GitApiResponse,
  GitApiSuccessResponse,
} from "./client/types.js";
import { GitApiClientError, parseJsonResponse } from "./client/error.js";
import { appendQuery, buildQuery, encodePathSegment, mergeHeaders, normalizeBaseUrl, resolveHeaders } from "./client/helpers.js";

function resolveSocketEndpoint(
  baseUrl: string,
  pathOverride: string | undefined,
): {
  path: string;
  url?: string;
} {
  const trimmed = normalizeBaseUrl(baseUrl);
  let absolute: URL | null = null;
  try {
    absolute = new URL(trimmed);
  } catch {
    absolute = null;
  }

  const basePath = absolute
    ? absolute.pathname.replace(/\/+$/g, "")
    : trimmed.replace(/\/+$/g, "");
  const path = (() => {
    const next = String(pathOverride || "").trim().replace(/\/+$/g, "");
    if (next) return next.startsWith("/") ? next : `/${next}`;
    const derived = `${basePath || ""}/socket.io`.replace(/\/{2,}/g, "/");
    return derived.startsWith("/") ? derived : `/${derived}`;
  })();

  return absolute
    ? { path, url: `${absolute.protocol}//${absolute.host}` }
    : { path };
}

function createGitApiClient(options: CreateGitApiClientOptions): GitApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new TypeError("createGitApiClient() requires fetch support.");
  }

  async function request<TAction extends GitApiResource, TData>(
    repositoryKey: string,
    actionPath: string,
    input?: GitApiClientRequestOptions & {
      query?: URLSearchParams;
    },
  ): Promise<GitApiSuccessResponse<TAction, TData>> {
    const repositoryBasePath = `/repositories/${encodePathSegment(repositoryKey)}`;
    const requestPath = `${repositoryBasePath}/${String(actionPath || "").replace(/^\/+/, "")}`;
    const url = appendQuery(`${baseUrl}${requestPath}`, input?.query);
    const resolvedHeaders = mergeHeaders(
      await resolveHeaders(options.headers, {
        path: requestPath,
        repositoryKey,
      }),
      input?.headers,
    );
    const method = input?.method || "GET";
    const body = input?.body == null || method === "GET"
      ? undefined
      : JSON.stringify(input.body);
    const finalHeaders = body
      ? mergeHeaders({ "content-type": "application/json; charset=utf-8" }, resolvedHeaders)
      : resolvedHeaders;

    const response = await fetchImpl(url, {
      body,
      headers: finalHeaders,
      method,
      signal: input?.signal,
    });
    const payload = await parseJsonResponse(response) as GitApiResponse<TAction, TData> | null;

    if (!payload && response.ok) {
      throw new GitApiClientError({
        code: "empty_response",
        message: "Git API returned an empty response.",
        status: response.status || 500,
      });
    }

    if (payload && payload.ok === false) {
      throw new GitApiClientError({
        code: payload.error.code,
        details: payload.error.details,
        message: payload.error.message,
        status: response.status || 500,
      });
    }

    if (!response.ok) {
      throw new GitApiClientError({
        code: "http_error",
        message: `Git API request failed with status ${response.status}.`,
        status: response.status || 500,
      });
    }

    return payload as GitApiSuccessResponse<TAction, TData>;
  }

  return {
    baseUrl,
    async diff(repositoryKey, input) {
      const response = await request<"diff", ReturnType<GitApiClient["diff"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "diff", {
        headers: input.headers,
        query: buildQuery({
          baseRef: input.baseRef,
          headRef: input.headRef,
          path: input.path,
        }),
        signal: input.signal,
      });
      return response.data;
    },
    async listBranches(repositoryKey, input) {
      const response = await request<"branches", ReturnType<GitApiClient["listBranches"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "branches", input);
      return response.data;
    },
    async listActivity(repositoryKey, input) {
      const response = await request<"activity", ReturnType<GitApiClient["listActivity"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "activity", input);
      return response.data;
    },
    async listCommits(repositoryKey, input) {
      const response = await request<"commits", ReturnType<GitApiClient["listCommits"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "commits", {
        headers: input?.headers,
        query: buildQuery({
          limit: input?.limit,
          path: input?.path,
          ref: input?.ref,
        }),
        signal: input?.signal,
      });
      return response.data;
    },
    async listTags(repositoryKey, input) {
      const response = await request<"tags", ReturnType<GitApiClient["listTags"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "tags", input);
      return response.data;
    },
    async listForks(repositoryKey, input) {
      const response = await request<"forks", ReturnType<GitApiClient["listForks"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "forks", input);
      return response.data;
    },
    async listReleases(repositoryKey, input) {
      const response = await request<"releases", ReturnType<GitApiClient["listReleases"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "releases", input);
      return response.data;
    },
    async listTree(repositoryKey, input) {
      const response = await request<"tree", ReturnType<GitApiClient["listTree"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "tree", {
        headers: input?.headers,
        query: buildQuery({
          icons: input?.icons,
          linguist: input?.linguist,
          path: input?.path,
          recursive: input?.recursive,
          ref: input?.ref,
        }),
        signal: input?.signal,
      });
      return response.data;
    },
    async readBlob(repositoryKey, input) {
      const response = await request<"blob", ReturnType<GitApiClient["readBlob"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "blob", {
        headers: input.headers,
        query: buildQuery({
          path: input.path,
          ref: input.ref,
        }),
        signal: input.signal,
      });
      return response.data;
    },
    async readArchive(repositoryKey, input) {
      const response = await request<"archive", ReturnType<GitApiClient["readArchive"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "archive", {
        headers: input?.headers,
        query: buildQuery({
          format: input?.format,
          prefix: input?.prefix,
          ref: input?.ref,
        }),
        signal: input?.signal,
      });
      return response.data;
    },
    async readBlame(repositoryKey, input) {
      const response = await request<"blame", ReturnType<GitApiClient["readBlame"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "blame", {
        headers: input.headers,
        query: buildQuery({
          path: input.path,
          ref: input.ref,
        }),
        signal: input.signal,
      });
      return response.data;
    },
    async readCommit(repositoryKey, commitRef, input) {
      const response = await request<"commit", ReturnType<GitApiClient["readCommit"]> extends Promise<infer TData> ? TData : never>(
        repositoryKey,
        `commits/${encodePathSegment(commitRef)}`,
        input,
      );
      return response.data;
    },
    async readLinguist(repositoryKey, input) {
      const response = await request<"linguist", ReturnType<GitApiClient["readLinguist"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "linguist", {
        headers: input?.headers,
        query: buildQuery({
          ref: input?.ref,
        }),
        signal: input?.signal,
      });
      return response.data;
    },
    openLinguistSocket(repositoryKey, input) {
      const { path, url } = resolveSocketEndpoint(baseUrl, options.socketOptions && options.socketOptions.path);
      let socket: ReturnType<typeof connectSocket> | null = null;
      let settled = false;
      let rejectCompleted: ((reason?: unknown) => void) | null = null;
      let resolveCompleted: (() => void) | null = null;
      const cleanup = () => {
        socket?.off(LINGUIST_PROGRESS_EVENT);
        socket?.off(LINGUIST_RESULT_EVENT);
        socket?.off(LINGUIST_DONE_EVENT);
        socket?.off(LINGUIST_ERROR_EVENT);
        socket?.off("connect");
        socket?.off("connect_error");
        input?.signal?.removeEventListener("abort", onAbort);
      };
      const finish = (kind: "reject" | "resolve", value?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (kind === "resolve") resolveCompleted && resolveCompleted();
        else rejectCompleted && rejectCompleted(value);
        socket?.disconnect();
      };
      const onAbort = () => {
        const abortError = new Error("Git linguist socket request was aborted.");
        abortError.name = "AbortError";
        finish("reject", abortError);
      };
      input?.signal?.addEventListener("abort", onAbort, { once: true });

      const completed = new Promise<void>((resolve, reject) => {
        resolveCompleted = resolve;
        rejectCompleted = reject;
      });

      void (async () => {
        const repositoryBasePath = `/repositories/${encodePathSegment(repositoryKey)}`;
        const requestPath = `${repositoryBasePath}/linguist/socket`;
        const resolvedHeaders = mergeHeaders(
          await resolveHeaders(options.headers, {
            path: requestPath,
            repositoryKey,
          }),
          input?.headers,
        );

        socket = connectSocket(url, {
          ...(options.socketOptions || {}),
          autoConnect: false,
          extraHeaders: {
            ...((options.socketOptions && options.socketOptions.extraHeaders) || {}),
            ...(resolvedHeaders || {}),
          },
          path,
          transports: (options.socketOptions && options.socketOptions.transports) || ["websocket"],
        });
        if (settled) {
          socket.disconnect();
          return;
        }
        socket.on("connect", () => {
          socket && socket.emit(LINGUIST_START_EVENT, {
            ref: input?.ref,
            repositoryKey,
          });
        });
        socket.on("connect_error", (error: Error) => {
          finish("reject", error);
        });
        socket.on(LINGUIST_PROGRESS_EVENT, async (payload: unknown) => {
          const nextEvent = {
            progress: payload,
            type: "progress",
          } as GitLinguistSocketProgressEvent;
          await input?.onProgress?.(nextEvent.progress);
          await input?.onEvent?.(nextEvent);
        });
        socket.on(LINGUIST_RESULT_EVENT, async (payload: unknown) => {
          const nextEvent = {
            ...(payload as Omit<GitLinguistSocketResultEvent, "type">),
            type: "result",
          } as GitLinguistSocketResultEvent;
          await input?.onResult?.(nextEvent);
          await input?.onEvent?.(nextEvent);
        });
        socket.on(LINGUIST_DONE_EVENT, async (payload: unknown) => {
          const nextEvent = {
            ...(payload as Omit<GitLinguistSocketDoneEvent, "type">),
            type: "done",
          } as GitLinguistSocketDoneEvent;
          await input?.onDone?.(nextEvent);
          await input?.onEvent?.(nextEvent);
          finish(nextEvent.ok === false ? "reject" : "resolve", nextEvent.ok === false
            ? new GitApiClientError({
              code: "git_api_error",
              message: "Git linguist socket ended without a successful result.",
              status: 500,
            })
            : undefined);
        });
        socket.on(LINGUIST_ERROR_EVENT, async (payload: unknown) => {
          const nextEvent = {
            ...(payload as Omit<GitLinguistSocketErrorEvent, "type">),
            type: "error",
          } as GitLinguistSocketErrorEvent;
          await input?.onError?.(nextEvent);
          await input?.onEvent?.(nextEvent);
          finish("reject", new GitApiClientError({
            code: nextEvent.error.code,
            details: nextEvent.error.details,
            message: nextEvent.error.message,
            status: nextEvent.status || 500,
          }));
        });
        socket.connect();
      })().catch((error) => {
        finish("reject", error);
      });

      return {
        close() {
          onAbort();
        },
        completed,
      };
    },
    async readTag(repositoryKey, tagName, input) {
      const response = await request<"tag", ReturnType<GitApiClient["readTag"]> extends Promise<infer TData> ? TData : never>(
        repositoryKey,
        `tags/${encodePathSegment(tagName)}`,
        input,
      );
      return response.data;
    },
    async readOverview(repositoryKey, input) {
      const response = await request<"overview", ReturnType<GitApiClient["readOverview"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "overview", input);
      return response.data;
    },
    async readRelease(repositoryKey, releaseId, input) {
      const response = await request<"release", ReturnType<GitApiClient["readRelease"]> extends Promise<infer TData> ? TData : never>(
        repositoryKey,
        `releases/${encodePathSegment(releaseId)}`,
        input,
      );
      return response.data;
    },
    async readSocialState(repositoryKey, input) {
      const response = await request<"social", ReturnType<GitApiClient["readSocialState"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "social", input);
      return response.data;
    },
    async readSummary(repositoryKey, input) {
      const response = await request<"summary", ReturnType<GitApiClient["readSummary"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "summary", {
        headers: input?.headers,
        query: buildQuery({
          commitLimit: input?.commitLimit,
        }),
        signal: input?.signal,
      });
      return response.data;
    },
    async createFork(repositoryKey, input) {
      const response = await request<"forks", ReturnType<GitApiClient["createFork"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "forks", {
        body: {},
        headers: input?.headers,
        method: "POST",
        signal: input?.signal,
      });
      return response.data;
    },
    async createRelease(repositoryKey, input) {
      const response = await request<"releases", ReturnType<GitApiClient["createRelease"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "releases", {
        body: {
          assets: input.assets,
          createTag: input.createTag,
          draft: input.draft,
          existingTagName: input.existingTagName,
          notes: input.notes,
          prerelease: input.prerelease,
          publishedAt: input.publishedAt,
          title: input.title,
        },
        headers: input.headers,
        method: "POST",
        signal: input.signal,
      });
      return response.data;
    },
    async updateRelease(repositoryKey, releaseId, input) {
      const response = await request<"release", ReturnType<GitApiClient["updateRelease"]> extends Promise<infer TData> ? TData : never>(
        repositoryKey,
        `releases/${encodePathSegment(releaseId)}`,
        {
          body: {
            assets: input.assets,
            draft: input.draft,
            notes: input.notes,
            prerelease: input.prerelease,
            publishedAt: input.publishedAt,
            title: input.title,
          },
          headers: input.headers,
          method: "PATCH",
          signal: input.signal,
        },
      );
      return response.data;
    },
    async deleteRelease(repositoryKey, releaseId, input) {
      const response = await request<"release", ReturnType<GitApiClient["deleteRelease"]> extends Promise<infer TData> ? TData : never>(
        repositoryKey,
        `releases/${encodePathSegment(releaseId)}`,
        {
          body: {
            deleteTag: input?.deleteTag === true,
          },
          headers: input?.headers,
          method: "DELETE",
          signal: input?.signal,
        },
      );
      return response.data;
    },
    async starRepository(repositoryKey, input) {
      const response = await request<"stars", ReturnType<GitApiClient["starRepository"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "stars", {
        body: {},
        headers: input?.headers,
        method: "POST",
        signal: input?.signal,
      });
      return response.data;
    },
    async unstarRepository(repositoryKey, input) {
      const response = await request<"stars", ReturnType<GitApiClient["unstarRepository"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "stars", {
        body: {},
        headers: input?.headers,
        method: "DELETE",
        signal: input?.signal,
      });
      return response.data;
    },
    async watchRepository(repositoryKey, input) {
      const response = await request<"watch", ReturnType<GitApiClient["watchRepository"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "watch", {
        body: {},
        headers: input?.headers,
        method: "POST",
        signal: input?.signal,
      });
      return response.data;
    },
    async unwatchRepository(repositoryKey, input) {
      const response = await request<"watch", ReturnType<GitApiClient["unwatchRepository"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "watch", {
        body: {},
        headers: input?.headers,
        method: "DELETE",
        signal: input?.signal,
      });
      return response.data;
    },
    async syncFork(repositoryKey, forkId, input) {
      const response = await request<"fork_sync", ReturnType<GitApiClient["syncFork"]> extends Promise<infer TData> ? TData : never>(
        repositoryKey,
        `forks/${encodePathSegment(forkId)}/sync`,
        {
          body: {
            strategy: input?.strategy,
          },
          headers: input?.headers,
          method: "POST",
          signal: input?.signal,
        },
      );
      return response.data;
    },
    async search(repositoryKey, input) {
      const response = await request<"search", ReturnType<GitApiClient["search"]> extends Promise<infer TData> ? TData : never>(repositoryKey, "search", {
        headers: input.headers,
        query: buildQuery({
          caseSensitive: input.caseSensitive,
          limit: input.limit,
          path: input.path,
          query: input.query,
          ref: input.ref,
          regexp: input.regexp,
        }),
        signal: input.signal,
      });
      return response.data;
    },
    request,
  };
}

export { GitApiClientError, createGitApiClient };

export type {
  CreateGitApiClientOptions,
  GitApiEventStream,
  GitApiClient,
  GitApiClientFetch,
  GitApiClientHeaders,
  GitApiClientRequestOptions,
  GitApiFailureResponse,
  GitApiHeaderResolver,
  GitApiResponse,
  GitApiSuccessResponse,
  GitLinguistSocketDoneEvent,
  GitLinguistSocketErrorEvent,
  GitLinguistSocketEvent,
  GitLinguistSocketProgressEvent,
  GitLinguistSocketResultEvent,
} from "./client/types.js";
