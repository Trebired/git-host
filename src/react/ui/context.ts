import {
  createContext,
  createElement,
  useContext,
  type CSSProperties,
  type ComponentType,
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

type GitRepositoryUiSlot =
  | "action-bar"
  | "actions"
  | "badge"
  | "blame"
  | "blame-commit"
  | "blame-row"
  | "breadcrumb"
  | "breadcrumbs"
  | "button"
  | "button-active"
  | "button-primary"
  | "card"
  | "card-header"
  | "card-subtitle"
  | "card-title"
  | "code-block"
  | "code-inline"
  | "definition-grid"
  | "empty-action"
  | "empty-state"
  | "empty-title"
  | "error-state"
  | "grid"
  | "header"
  | "header-actions"
  | "header-top"
  | "input"
  | "list"
  | "list-item"
  | "list-link"
  | "loading-state"
  | "note"
  | "page"
  | "shell-body"
  | "split"
  | "stats"
  | "status"
  | "subtitle"
  | "tab-link"
  | "tabs"
  | "textarea"
  | "title"
  | "title-block";

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
  classNames?: Partial<Record<GitRepositoryUiSlot, string>>;
  className?: string;
  density?: "comfortable" | "compact";
  iconOverrides?: Partial<Record<"activity" | "branch" | "code" | "commit" | "compare" | "fork" | "release" | "search" | "star" | "tag" | "watch", string>>;
  mode?: "auto" | "dark" | "light";
  slots?: Partial<Record<GitRepositoryUiSlot, {
    attributes?: Record<string, string | number | boolean | undefined>;
    className?: string;
    style?: CSSProperties;
  }>>;
  typography?: {
    bodyClassName?: string;
    headingClassName?: string;
  };
  unstyled?: boolean;
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

type GitRepositoryLoadingStateProps = {
  className?: string;
  message?: string;
};

type GitRepositoryErrorStateProps = {
  className?: string;
  error: Error | null;
  onRetry?: () => void;
};

type GitRepositoryEmptyStateProps = {
  action?: ReactNode;
  className?: string;
  message?: string;
  title?: string;
};

type GitRepositoryUiComponents = {
  EmptyState?: ComponentType<GitRepositoryEmptyStateProps>;
  ErrorState?: ComponentType<GitRepositoryErrorStateProps>;
  LoadingState?: ComponentType<GitRepositoryLoadingStateProps>;
};

type GitRepositoryUiContextValue = {
  client?: GitApiClient;
  components: GitRepositoryUiComponents;
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
  components?: GitRepositoryUiComponents;
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

const defaultSlotClassNames: Record<GitRepositoryUiSlot, string> = {
  "action-bar": "git-browser-header-actions",
  actions: "git-browser-actions",
  badge: "git-browser-badge",
  blame: "git-browser-blame",
  "blame-commit": "git-browser-blame-commit",
  "blame-row": "git-browser-blame-row",
  breadcrumb: "git-browser-breadcrumb",
  breadcrumbs: "git-browser-breadcrumbs",
  button: "git-browser-action-button",
  "button-active": "is-active",
  "button-primary": "is-primary",
  card: "git-browser-card",
  "card-header": "git-browser-card-header",
  "card-subtitle": "git-browser-card-subtitle",
  "card-title": "git-browser-card-title",
  "code-block": "git-browser-code-block",
  "code-inline": "git-browser-code-inline",
  "definition-grid": "git-browser-definition-grid",
  "empty-action": "git-browser-empty-action",
  "empty-state": "git-browser-empty-state",
  "empty-title": "git-browser-empty-title",
  "error-state": "git-browser-error-state",
  grid: "git-browser-grid",
  header: "git-browser-hero",
  "header-actions": "git-browser-header-actions",
  "header-top": "git-browser-hero-top",
  input: "git-browser-input",
  list: "git-browser-list",
  "list-item": "git-browser-list-item",
  "list-link": "git-browser-list-link",
  "loading-state": "git-browser-loading-state",
  note: "git-browser-note",
  page: "git-browser-page",
  "shell-body": "git-browser-shell-body",
  split: "git-browser-split",
  stats: "git-browser-stats",
  status: "git-browser-status",
  subtitle: "git-browser-subtitle",
  "tab-link": "git-browser-nav-link",
  tabs: "git-browser-nav",
  textarea: "git-browser-textarea",
  title: "git-browser-title",
  "title-block": "git-browser-title-block",
};

function joinClassNames(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
}

function resolveGitRepositorySlotProps(
  ui: GitRepositoryUiContextValue,
  slot: GitRepositoryUiSlot,
  input: {
    className?: string;
    style?: CSSProperties;
    [key: string]: unknown;
  } = {},
) {
  const slotConfig = ui.theme.slots?.[slot];
  const { className, style, ...rest } = input;

  return {
    ...slotConfig?.attributes,
    ...rest,
    className: joinClassNames(
      ui.theme.unstyled ? undefined : defaultSlotClassNames[slot],
      ui.theme.classNames?.[slot],
      slotConfig?.className,
      className,
    ),
    "data-density": ui.theme.density || "comfortable",
    "data-slot": slot,
    "data-theme-mode": ui.theme.mode || "auto",
    style: slotConfig?.style || style
      ? {
        ...(slotConfig?.style || {}),
        ...(style || {}),
      }
      : undefined,
  };
}

const GitRepositoryUiContext = createContext<GitRepositoryUiContextValue>({
  branding: {},
  components: {},
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
      components: props.components || {},
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

function useGitRepositoryClassName(slot: GitRepositoryUiSlot, ...values: Array<string | undefined | null | false>) {
  const ui = useGitRepositoryUi();
  return joinClassNames(
    ui.theme.unstyled ? undefined : defaultSlotClassNames[slot],
    ui.theme.classNames?.[slot],
    ui.theme.slots?.[slot]?.className,
    ...values,
  );
}

function useGitRepositorySlotProps(
  slot: GitRepositoryUiSlot,
  input: {
    className?: string;
    style?: CSSProperties;
    [key: string]: unknown;
  } = {},
) {
  return resolveGitRepositorySlotProps(useGitRepositoryUi(), slot, input);
}

export {
  GitRepositoryUiProvider,
  createGitRepositoryRouteAdapter,
  resolveGitRepositorySlotProps,
  useGitRepositoryClassName,
  useGitRepositoryDiagnostics,
  useGitRepositoryRouteAdapter,
  useGitRepositorySlotProps,
  useGitRepositoryUi,
};

export type {
  GitRepositoryEmptyStateProps,
  GitRepositoryFrontEndInitialData,
  GitRepositoryErrorStateProps,
  GitRepositoryLoadingStateProps,
  GitRepositoryPageKey,
  GitRepositoryRouteAdapter,
  GitRepositoryUiBranding,
  GitRepositoryUiComponents,
  GitRepositoryUiContextValue,
  GitRepositoryUiDiagnostics,
  GitRepositoryUiFetchEvent,
  GitRepositoryUiPolicy,
  GitRepositoryUiProviderProps,
  GitRepositoryUiSlot,
  GitRepositoryUiTheme,
};
