import {
  createContext,
  createElement,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { GitApiClient } from "../client.js";
import type { GitApiClientProviderProps, GitApiMutationResult, GitApiQueryOptions, GitApiQueryResult } from "./types.js";
import { useGitRepositoryDiagnostics } from "../ui/context.js";

const GitApiClientContext = createContext<GitApiClient | null>(null);
const gitApiQueryCache = new Map<string, unknown>();
const gitApiInFlight = new Map<string, Promise<unknown>>();

function GitApiClientProvider(props: GitApiClientProviderProps) {
  return createElement(GitApiClientContext.Provider, {
    value: props.client,
    children: props.children,
  });
}

function useGitApiClient(client?: GitApiClient): GitApiClient {
  const contextClient = useContext(GitApiClientContext);
  const resolvedClient = client || contextClient;
  if (!resolvedClient) {
    throw new Error("GitApiClientProvider is missing. Pass a client or wrap your tree in the provider.");
  }
  return resolvedClient;
}

function normalizeQueryKey(value: unknown[]): string {
  return JSON.stringify(value);
}

function useGitApiQuery<TData>(
  input: GitApiQueryOptions<TData> & {
    key: unknown[];
    load: (client: GitApiClient, signal: AbortSignal) => Promise<TData>;
  },
): GitApiQueryResult<TData> {
  const client = useGitApiClient(input.client);
  const diagnostics = useGitRepositoryDiagnostics();
  const enabled = input.enabled !== false;
  const loadRef = useRef(input.load);
  loadRef.current = input.load;
  const queryKey = normalizeQueryKey(input.key);
  const initialCached = (gitApiQueryCache.has(queryKey) ? gitApiQueryCache.get(queryKey) as TData : undefined);
  const [data, setData] = useState<TData | null>(input.initialData ?? initialCached ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled && !input.initialData && initialCached == null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let canceled = false;

    const cached = gitApiQueryCache.has(queryKey) ? gitApiQueryCache.get(queryKey) as TData : undefined;
    if (cached !== undefined) {
      setData(cached);
    }
    setLoading(cached == null);
    setError(null);
    diagnostics.onFetchStart?.({ key: queryKey });

    const pending = gitApiInFlight.get(queryKey) as Promise<TData> | undefined;
    const request = pending || loadRef.current(client, controller.signal);
    if (!pending) {
      gitApiInFlight.set(queryKey, request);
    }

    void request
      .then((nextData) => {
        if (canceled) return;
        gitApiQueryCache.set(queryKey, nextData);
        gitApiInFlight.delete(queryKey);
        diagnostics.onFetchSuccess?.({ data: nextData, key: queryKey });
        startTransition(() => {
          setData(nextData);
          setLoading(false);
        });
      })
      .catch((nextError) => {
        if (canceled) return;
        if (nextError instanceof Error && nextError.name === "AbortError") return;
        gitApiInFlight.delete(queryKey);
        const normalized = nextError instanceof Error ? nextError : new Error(String(nextError));
        diagnostics.onFetchError?.({ error: normalized, key: queryKey });
        startTransition(() => {
          setError(normalized);
          setLoading(false);
        });
      });

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [client, enabled, queryKey, reloadNonce]);

  return {
    data,
    error,
    loading,
    reload() {
      setReloadNonce((value) => value + 1);
    },
  };
}

function useGitApiMutation<TInput, TData>(
  input: {
    client?: GitApiClient;
    mutate: (client: GitApiClient, input: TInput) => Promise<TData>;
  },
): GitApiMutationResult<TInput, TData> {
  const client = useGitApiClient(input.client);
  const diagnostics = useGitRepositoryDiagnostics();
  const mutateRef = useRef(input.mutate);
  mutateRef.current = input.mutate;
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  return {
    data,
    error,
    loading,
    async mutate(nextInput: TInput) {
      setLoading(true);
      setError(null);
      diagnostics.onActionStart?.({ action: "mutation", input: nextInput });
      try {
        const result = await mutateRef.current(client, nextInput);
        diagnostics.onActionSuccess?.({ action: "mutation", input: nextInput, result });
        startTransition(() => {
          setData(result);
          setLoading(false);
        });
        return result;
      } catch (nextError) {
        const normalized = nextError instanceof Error ? nextError : new Error(String(nextError));
        diagnostics.onActionError?.({ action: "mutation", error: normalized, input: nextInput });
        startTransition(() => {
          setError(normalized);
          setLoading(false);
        });
        throw normalized;
      }
    },
    reset() {
      startTransition(() => {
        setData(null);
        setError(null);
        setLoading(false);
      });
    },
  };
}

export { GitApiClientProvider, useGitApiClient, useGitApiMutation, useGitApiQuery };
