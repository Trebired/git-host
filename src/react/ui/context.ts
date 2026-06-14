import {
  createContext,
  createElement,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { GitApiClient } from "../client.js";
import type {
  GitBranchSummary,
  GitCommitDetail,
  GitCommitSummary,
  GitCompareSummary,
  GitForgeActivityEntry,
  GitForgeFork,
  GitForgeRelease,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitSearchResult,
  GitTagDetail,
  GitTagSummary,
  GitTreeEntry,
} from "../../types.js";
import { text } from "../../utils/text.js";

type GitRepositoryPageKey =
  | "activity"
  | "blame"
  | "branches"
  | "code"
  | "commit"
  | "commits"
  | "compare"
  | "forks"
  | "overview"
  | "release"
  | "releases"
  | "search"
  | "tags";

type GitRepositoryRouteAdapter = {
  activity: (repositoryKey: string) => string;
  blame: (repositoryKey: string, path: string, ref?: string) => string;
  branches: (repositoryKey: string) => string;
  code: (repositoryKey: string, path?: string, ref?: string) => string;
  commit: (repositoryKey: string, commitRef: string) => string;
  commits: (repositoryKey: string, path?: string, ref?: string) => string;
  compare: (repositoryKey: string, baseRef: string, headRef: string, path?: string) => string;
  forks: (repositoryKey: string) => string;
  overview: (repositoryKey: string) => string;
  release: (repositoryKey: string, releaseId: string) => string;
  releases: (repositoryKey: string) => string;
  search: (repositoryKey: string, query?: string, ref?: string, path?: string) => string;
  tags: (repositoryKey: string) => string;
};

type GitRepositoryUiFetchEvent = {
  key: string;
  repositoryKey?: string;
};

type GitRepositoryUiActionEvent = {
  action: string;
  repositoryKey?: string;
};

type GitRepositoryUiDiagnostics = {
  onActionError?: (event: GitRepositoryUiActionEvent & { error: Error; input?: unknown }) => void;
  onActionStart?: (event: GitRepositoryUiActionEvent & { input?: unknown }) => void;
  onActionSuccess?: (event: GitRepositoryUiActionEvent & { input?: unknown; result: unknown }) => void;
  onEmptyState?: (event: { page: GitRepositoryPageKey; reason: string; repositoryKey?: string }) => void;
  onFetchError?: (event: GitRepositoryUiFetchEvent & { error: Error }) => void;
  onFetchStart?: (event: GitRepositoryUiFetchEvent) => void;
  onFetchSuccess?: (event: GitRepositoryUiFetchEvent & { data: unknown }) => void;
  onNavigate?: (event: { repositoryKey?: string; to: string }) => void;
  onRenderStateChange?: (event: { empty: boolean; error: boolean; loading: boolean; page: GitRepositoryPageKey; repositoryKey?: string }) => void;
  onViewMount?: (event: { page: GitRepositoryPageKey; repositoryKey?: string }) => void;
};

type GitRepositoryUiTheme = {
  className?: string;
  density?: "comfortable" | "compact";
  iconOverrides?: Partial<Record<"activity" | "branch" | "code" | "commit" | "compare" | "fork" | "release" | "search" | "star" | "tag" | "watch", string>>;
  mode?: "auto" | "dark" | "light";
  typography?: {
    bodyClassName?: string;
    headingClassName?: string;
  };
  variables?: Record<string, string>;
};

type GitRepositoryUiBranding = {
  getCloneUrl?: (repositoryKey: string, protocol?: "http" | "ssh") => string;
  subtitle?: string | ((input: { overview?: GitForgeRepositoryOverview | null; repositoryKey: string }) => string);
};

type GitRepositoryUiPolicy = {
  canCreateFork?: boolean;
  canCreateRelease?: boolean;
  canDeleteRelease?: boolean;
  canUpdateRelease?: boolean;
};

type GitRepositoryFrontEndInitialData = {
  activity?: GitForgeActivityEntry[] | null;
  blame?: GitCommitDetail | null;
  branches?: GitBranchSummary[] | null;
  commit?: GitCommitDetail | null;
  commits?: GitCommitSummary[] | null;
  compare?: GitCompareSummary | null;
  forks?: GitForgeFork[] | null;
  overview?: GitForgeRepositoryOverview | null;
  release?: GitForgeRelease | null;
  releases?: GitForgeRelease[] | null;
  search?: GitSearchResult | null;
  social?: GitForgeSocialState | null;
  tag?: GitTagDetail | null;
  tags?: GitTagSummary[] | null;
  tree?: GitTreeEntry[] | null;
};

type GitRepositoryUiContextValue = {
  client?: GitApiClient;
  diagnostics: GitRepositoryUiDiagnostics;
  navigate: (to: string) => void;
  policy: GitRepositoryUiPolicy;
  routeAdapter: GitRepositoryRouteAdapter;
  theme: GitRepositoryUiTheme;
  themeStyle: CSSProperties | undefined;
  branding: GitRepositoryUiBranding;
};

type GitRepositoryUiProviderProps = {
  branding?: GitRepositoryUiBranding;
  children?: ReactNode;
  client?: GitApiClient;
  diagnostics?: GitRepositoryUiDiagnostics;
  navigate?: (to: string) => void;
  policy?: GitRepositoryUiPolicy;
  routeAdapter?: Partial<GitRepositoryRouteAdapter>;
  theme?: GitRepositoryUiTheme;
};

function encodeQuery(values: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const next = text(value);
    if (next) query.set(key, next);
  }
  const suffix = String(query);
  return suffix ? `?${suffix}` : "";
}

function createGitRepositoryRouteAdapter(input: {
  repositoryBasePath?: string;
} = {}): GitRepositoryRouteAdapter {
  const repositoryBasePath = text(input.repositoryBasePath, "/repositories").replace(/\/+$/g, "");
  const repositoryPath = (repositoryKey: string) => `${repositoryBasePath}/${encodeURIComponent(repositoryKey)}`;

  return {
    overview(repositoryKey) {
      return `${repositoryPath(repositoryKey)}/overview`;
    },
    code(repositoryKey, path, ref) {
      return `${repositoryPath(repositoryKey)}/code${encodeQuery({ path, ref })}`;
    },
    commits(repositoryKey, path, ref) {
      return `${repositoryPath(repositoryKey)}/commits${encodeQuery({ path, ref })}`;
    },
    commit(repositoryKey, commitRef) {
      return `${repositoryPath(repositoryKey)}/commits/${encodeURIComponent(commitRef)}`;
    },
    releases(repositoryKey) {
      return `${repositoryPath(repositoryKey)}/releases`;
    },
    release(repositoryKey, releaseId) {
      return `${repositoryPath(repositoryKey)}/releases/${encodeURIComponent(releaseId)}`;
    },
    forks(repositoryKey) {
      return `${repositoryPath(repositoryKey)}/forks`;
    },
    activity(repositoryKey) {
      return `${repositoryPath(repositoryKey)}/activity`;
    },
    blame(repositoryKey, path, ref) {
      return `${repositoryPath(repositoryKey)}/blame${encodeQuery({ path, ref })}`;
    },
    compare(repositoryKey, baseRef, headRef, path) {
      return `${repositoryPath(repositoryKey)}/compare${encodeQuery({ baseRef, headRef, path })}`;
    },
    branches(repositoryKey) {
      return `${repositoryPath(repositoryKey)}/branches`;
    },
    tags(repositoryKey) {
      return `${repositoryPath(repositoryKey)}/tags`;
    },
    search(repositoryKey, query, ref, path) {
      return `${repositoryPath(repositoryKey)}/search${encodeQuery({ path, query, ref })}`;
    },
  };
}

function buildThemeStyle(theme: GitRepositoryUiTheme | undefined): CSSProperties | undefined {
  if (!theme?.variables || !Object.keys(theme.variables).length) return undefined;
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.variables)) {
    if (!key || value == null) continue;
    style[key.startsWith("--") ? key : `--${key}`] = String(value);
  }
  return style as CSSProperties;
}

const defaultRouteAdapter = createGitRepositoryRouteAdapter();

const GitRepositoryUiContext = createContext<GitRepositoryUiContextValue>({
  branding: {},
  diagnostics: {},
  navigate() {},
  policy: {},
  routeAdapter: defaultRouteAdapter,
  theme: {},
  themeStyle: undefined,
});

function GitRepositoryUiProvider(props: GitRepositoryUiProviderProps) {
  const routeAdapter = {
    ...defaultRouteAdapter,
    ...(props.routeAdapter || {}),
  };
  return createElement(GitRepositoryUiContext.Provider, {
    value: {
      branding: props.branding || {},
      client: props.client,
      diagnostics: props.diagnostics || {},
      navigate(to: string) {
        props.diagnostics?.onNavigate?.({ to });
        props.navigate?.(to);
      },
      policy: props.policy || {},
      routeAdapter,
      theme: props.theme || {},
      themeStyle: buildThemeStyle(props.theme),
    },
    children: props.children,
  });
}

function useGitRepositoryUi() {
  return useContext(GitRepositoryUiContext);
}

function useGitRepositoryRouteAdapter() {
  return useGitRepositoryUi().routeAdapter;
}

function useGitRepositoryDiagnostics() {
  return useGitRepositoryUi().diagnostics;
}

export {
  GitRepositoryUiProvider,
  createGitRepositoryRouteAdapter,
  useGitRepositoryDiagnostics,
  useGitRepositoryRouteAdapter,
  useGitRepositoryUi,
};

export type {
  GitRepositoryFrontEndInitialData,
  GitRepositoryPageKey,
  GitRepositoryRouteAdapter,
  GitRepositoryUiBranding,
  GitRepositoryUiContextValue,
  GitRepositoryUiDiagnostics,
  GitRepositoryUiFetchEvent,
  GitRepositoryUiPolicy,
  GitRepositoryUiProviderProps,
  GitRepositoryUiTheme,
};
