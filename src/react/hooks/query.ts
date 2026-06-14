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

const GitApiClientContext = createContext<GitApiClient | null>(null);

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
  const enabled = input.enabled !== false;
  const loadRef = useRef(input.load);
  loadRef.current = input.load;
  const queryKey = normalizeQueryKey(input.key);
  const [data, setData] = useState<TData | null>(input.initialData ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let canceled = false;

    setLoading(true);
    setError(null);

    void loadRef.current(client, controller.signal)
      .then((nextData) => {
        if (canceled) return;
        startTransition(() => {
          setData(nextData);
          setLoading(false);
        });
      })
      .catch((nextError) => {
        if (canceled) return;
        if (nextError instanceof Error && nextError.name === "AbortError") return;
        startTransition(() => {
          setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
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
      try {
        const result = await mutateRef.current(client, nextInput);
        startTransition(() => {
          setData(result);
          setLoading(false);
        });
        return result;
      } catch (nextError) {
        const normalized = nextError instanceof Error ? nextError : new Error(String(nextError));
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
