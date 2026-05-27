import type {
  CreateGitApiClientOptions,
  GitApiClient,
  GitApiClientRequestOptions,
  GitApiResource,
  GitApiResponse,
  GitApiSuccessResponse,
} from "./client/types.js";
import { GitApiClientError, parseJsonResponse } from "./client/error.js";
import { appendQuery, buildQuery, encodePathSegment, mergeHeaders, normalizeBaseUrl, resolveHeaders } from "./client/helpers.js";

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

    const response = await fetchImpl(url, {
      headers: resolvedHeaders,
      method: "GET",
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
    async readTag(repositoryKey, tagName, input) {
      const response = await request<"tag", ReturnType<GitApiClient["readTag"]> extends Promise<infer TData> ? TData : never>(
        repositoryKey,
        `tags/${encodePathSegment(tagName)}`,
        input,
      );
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
  GitApiClient,
  GitApiClientFetch,
  GitApiClientHeaders,
  GitApiClientRequestOptions,
  GitApiFailureResponse,
  GitApiHeaderResolver,
  GitApiResponse,
  GitApiSuccessResponse,
} from "./client/types.js";
