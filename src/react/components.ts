import {
  createElement,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { GitApiClientHeaders } from "./client.js";
import {
  applyGitStarOptimisticState,
  applyGitWatchOptimisticState,
  useGitBranches,
  useGitCreateFork,
  useGitCreateRelease,
  useGitDeleteRelease,
  useGitSocialState,
  useGitStarRepository,
  useGitSyncFork,
  useGitTags,
  useGitUnstarRepository,
  useGitUnwatchRepository,
  useGitUpdateRelease,
  useGitWatchRepository,
} from "./hooks.js";
import {
  GitRepositoryUiProvider,
  useGitRepositoryDiagnostics,
  useGitRepositoryRouteAdapter,
  useGitRepositoryUi,
  type GitRepositoryPageKey,
  type GitRepositoryUiProviderProps,
} from "./ui/context.js";
import type {
  GitBlame,
  GitBranchSummary,
  GitCommitSummary,
  GitCompareSummary,
  GitForgeActivityEntry,
  GitForgeFork,
  GitForgeRelease,
  GitForgeSocialState,
  GitSearchResult,
  GitTagSummary,
  GitTreeEntry,
} from "../types.js";
import { text } from "../utils/text.js";

const h = createElement;

function joinClassNames(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value: string | null | undefined): string {
  const next = text(value);
  if (!next) return "Unknown";
  try {
    return new Date(next).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return next;
  }
}

function useGitRepositoryRenderState(
  page: GitRepositoryPageKey,
  repositoryKey: string,
  input: {
    empty?: boolean;
    emptyReason?: string;
    error?: Error | null;
    loading?: boolean;
  },
) {
  const diagnostics = useGitRepositoryDiagnostics();
  useEffect(() => {
    diagnostics.onViewMount?.({ page, repositoryKey });
  }, [diagnostics, page, repositoryKey]);

  useEffect(() => {
    diagnostics.onRenderStateChange?.({
      empty: input.empty === true,
      error: Boolean(input.error),
      loading: input.loading === true,
      page,
      repositoryKey,
    });
    if (input.empty === true) {
      diagnostics.onEmptyState?.({
        page,
        reason: text(input.emptyReason, "empty"),
        repositoryKey,
      });
    }
  }, [diagnostics, input.empty, input.emptyReason, input.error, input.loading, page, repositoryKey]);
}

function GitLoadingState(props: { message?: string; className?: string }) {
  return h("div", {
    className: joinClassNames("git-browser-status git-browser-loading-state", props.className),
    children: props.message || "Loading repository data...",
  });
}

function GitErrorState(props: { error: Error | null; onRetry?: () => void; className?: string }) {
  return h("div", {
    className: joinClassNames("git-browser-status is-error git-browser-error-state", props.className),
    children: [
      h("div", { key: "message", children: props.error?.message || "This repository view failed to load." }),
      props.onRetry
        ? h("button", {
          className: "git-browser-action-button",
          key: "retry",
          onClick: props.onRetry,
          type: "button",
          children: "Retry",
        })
        : null,
    ],
  });
}

function GitEmptyState(props: { title?: string; message?: string; action?: ReactNode; className?: string }) {
  return h("section", {
    className: joinClassNames("git-browser-empty-state", props.className),
    children: [
      h("h3", { className: "git-browser-empty-title", key: "title", children: props.title || "Nothing here yet" }),
      h("p", { className: "git-browser-note", key: "message", children: props.message || "This repository section is empty." }),
      props.action ? h("div", { className: "git-browser-empty-action", key: "action", children: props.action }) : null,
    ],
  });
}

function GitRepositoryTabs(props: {
  active: GitRepositoryPageKey;
  className?: string;
  repositoryKey: string;
}) {
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  const items: Array<{ key: GitRepositoryPageKey; label: string; to: string }> = [
    { key: "overview", label: "Overview", to: routes.overview(props.repositoryKey) },
    { key: "code", label: "Code", to: routes.code(props.repositoryKey) },
    { key: "commits", label: "Commits", to: routes.commits(props.repositoryKey) },
    { key: "branches", label: "Branches", to: routes.branches(props.repositoryKey) },
    { key: "tags", label: "Tags", to: routes.tags(props.repositoryKey) },
    { key: "releases", label: "Releases", to: routes.releases(props.repositoryKey) },
    { key: "forks", label: "Forks", to: routes.forks(props.repositoryKey) },
    { key: "activity", label: "Activity", to: routes.activity(props.repositoryKey) },
    { key: "search", label: "Search", to: routes.search(props.repositoryKey) },
  ];

  return h("nav", {
    className: joinClassNames("git-browser-nav", props.className),
    children: items.map((item) => h("button", {
      className: joinClassNames("git-browser-nav-link", item.key === props.active && "is-active"),
      key: item.key,
      onClick: () => ui.navigate(item.to),
      type: "button",
      children: item.label,
    })),
  });
}

function GitRepositoryStats(props: {
  className?: string;
  repositoryKey: string;
  social?: GitForgeSocialState | null;
  stats: Array<{ label: string; value: ReactNode }>;
}) {
  return h("dl", {
    className: joinClassNames("git-browser-definition-grid", "git-browser-stats", props.className),
    children: props.stats.flatMap((entry) => ([
      h("dt", { key: `${entry.label}:label`, children: entry.label }),
      h("dd", { key: `${entry.label}:value`, children: entry.value }),
    ])),
  });
}

function GitStarButton(props: {
  headers?: GitApiClientHeaders;
  repositoryKey: string;
  social?: GitForgeSocialState | null;
}) {
  const [optimistic, setOptimistic] = useState<GitForgeSocialState | null>(props.social || null);
  const star = useGitStarRepository(props.repositoryKey, { headers: props.headers });
  const unstar = useGitUnstarRepository(props.repositoryKey, { headers: props.headers });
  useEffect(() => {
    setOptimistic(props.social || null);
  }, [props.social]);

  return h("button", {
    className: joinClassNames("git-browser-action-button", optimistic?.viewer_has_starred && "is-active"),
    disabled: star.loading || unstar.loading,
    onClick: async () => {
      const next = optimistic?.viewer_has_starred !== true;
      setOptimistic(applyGitStarOptimisticState(optimistic, next));
      try {
        setOptimistic(next ? await star.mutate() : await unstar.mutate());
      } catch {
        setOptimistic(props.social || null);
      }
    },
    type: "button",
    children: `${optimistic?.viewer_has_starred ? "Starred" : "Star"} ${optimistic?.star_count ?? 0}`,
  });
}

function GitWatchButton(props: {
  headers?: GitApiClientHeaders;
  repositoryKey: string;
  social?: GitForgeSocialState | null;
}) {
  const [optimistic, setOptimistic] = useState<GitForgeSocialState | null>(props.social || null);
  const watch = useGitWatchRepository(props.repositoryKey, { headers: props.headers });
  const unwatch = useGitUnwatchRepository(props.repositoryKey, { headers: props.headers });
  useEffect(() => {
    setOptimistic(props.social || null);
  }, [props.social]);

  return h("button", {
    className: joinClassNames("git-browser-action-button", optimistic?.viewer_is_watching && "is-active"),
    disabled: watch.loading || unwatch.loading,
    onClick: async () => {
      const next = optimistic?.viewer_is_watching !== true;
      setOptimistic(applyGitWatchOptimisticState(optimistic, next));
      try {
        setOptimistic(next ? await watch.mutate() : await unwatch.mutate());
      } catch {
        setOptimistic(props.social || null);
      }
    },
    type: "button",
    children: `${optimistic?.viewer_is_watching ? "Watching" : "Watch"} ${optimistic?.watcher_count ?? 0}`,
  });
}

function GitForkButton(props: { headers?: GitApiClientHeaders; repositoryKey: string; onCreated?: (fork: GitForgeFork) => void }) {
  const mutation = useGitCreateFork(props.repositoryKey, { headers: props.headers });
  return h("button", {
    className: "git-browser-action-button is-primary",
    disabled: mutation.loading,
    onClick: async () => {
      const created = await mutation.mutate();
      props.onCreated?.(created);
    },
    type: "button",
    children: mutation.loading ? "Forking..." : "Create Fork",
  });
}

function GitSyncForkButton(props: { headers?: GitApiClientHeaders; repositoryKey: string; forkId: string; onSynced?: (fork: GitForgeFork) => void }) {
  const mutation = useGitSyncFork(props.repositoryKey, props.forkId, { headers: props.headers });
  return h("button", {
    className: "git-browser-action-button",
    disabled: mutation.loading,
    onClick: async () => {
      const synced = await mutation.mutate({ strategy: "ff-only" });
      props.onSynced?.(synced);
    },
    type: "button",
    children: mutation.loading ? "Syncing..." : "Sync Fork",
  });
}

function GitCreateReleaseButton(props: {
  headers?: GitApiClientHeaders;
  input: Parameters<ReturnType<typeof useGitCreateRelease>["mutate"]>[0];
  onCreated?: (release: GitForgeRelease) => void;
  repositoryKey: string;
}) {
  const mutation = useGitCreateRelease(props.repositoryKey, { headers: props.headers });
  return h("button", {
    className: "git-browser-action-button is-primary",
    disabled: mutation.loading,
    onClick: async () => {
      const release = await mutation.mutate(props.input);
      props.onCreated?.(release);
    },
    type: "button",
    children: mutation.loading ? "Publishing..." : "Create Release",
  });
}

function GitEditReleaseButton(props: { onClick?: () => void; disabled?: boolean }) {
  return h("button", {
    className: "git-browser-action-button",
    disabled: props.disabled,
    onClick: props.onClick,
    type: "button",
    children: "Edit Release",
  });
}

function GitDeleteReleaseButton(props: { headers?: GitApiClientHeaders; releaseId: string; repositoryKey: string; deleteTag?: boolean; onDeleted?: () => void }) {
  const mutation = useGitDeleteRelease(props.repositoryKey, props.releaseId, { headers: props.headers });
  return h("button", {
    className: "git-browser-action-button",
    disabled: mutation.loading,
    onClick: async () => {
      await mutation.mutate({ deleteTag: props.deleteTag });
      props.onDeleted?.();
    },
    type: "button",
    children: mutation.loading ? "Deleting..." : "Delete Release",
  });
}

function GitRepositorySocialButtons(props: {
  headers?: GitApiClientHeaders;
  repositoryKey: string;
  social?: GitForgeSocialState | null;
}) {
  const social = useGitSocialState(props.repositoryKey, {
    headers: props.headers,
    initialData: props.social || null,
  });
  return h("div", {
    className: "git-browser-actions",
    children: [
      h(GitStarButton, { headers: props.headers, key: "star", repositoryKey: props.repositoryKey, social: social.data }),
      h(GitWatchButton, { headers: props.headers, key: "watch", repositoryKey: props.repositoryKey, social: social.data }),
    ],
  });
}

function GitBranchSelector(props: {
  className?: string;
  headers?: GitApiClientHeaders;
  onSelect?: (branch: string) => void;
  repositoryKey: string;
  selectedBranch?: string;
}) {
  const branches = useGitBranches(props.repositoryKey, { headers: props.headers });
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  return h("select", {
    className: joinClassNames("git-browser-input", props.className),
    disabled: branches.loading,
    onChange: (event: any) => {
      const branch = text(event.target?.value);
      props.onSelect?.(branch);
      if (branch) ui.navigate(routes.code(props.repositoryKey, "", branch));
    },
    value: props.selectedBranch || "",
    children: [
      h("option", { key: "empty", value: "", children: branches.loading ? "Loading branches..." : "Branch switcher" }),
      ...(branches.data || []).map((branch) => h("option", {
        key: branch.name,
        value: branch.name,
        children: branch.current ? `${branch.name} (current)` : branch.name,
      })),
    ],
  });
}

function GitTagSelector(props: {
  className?: string;
  headers?: GitApiClientHeaders;
  onSelect?: (tag: string) => void;
  repositoryKey: string;
  selectedTag?: string;
}) {
  const tags = useGitTags(props.repositoryKey, { headers: props.headers });
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  return h("select", {
    className: joinClassNames("git-browser-input", props.className),
    disabled: tags.loading,
    onChange: (event: any) => {
      const tag = text(event.target?.value);
      props.onSelect?.(tag);
      if (tag) ui.navigate(routes.code(props.repositoryKey, "", tag));
    },
    value: props.selectedTag || "",
    children: [
      h("option", { key: "empty", value: "", children: tags.loading ? "Loading tags..." : "Tag selector" }),
      ...(tags.data || []).map((tag) => h("option", {
        key: tag.name,
        value: tag.name,
        children: tag.name,
      })),
    ],
  });
}

function GitDownloadArchiveButton(props: { format?: "tar" | "zip"; refName?: string; repositoryKey: string }) {
  const ui = useGitRepositoryUi();
  const href = ui.client
    ? `${ui.client.baseUrl}/repositories/${encodeURIComponent(props.repositoryKey)}/archive?format=${encodeURIComponent(props.format || "zip")}${props.refName ? `&ref=${encodeURIComponent(props.refName)}` : ""}`
    : undefined;
  return h("a", {
    className: "git-browser-action-button",
    href,
    children: "Download Archive",
  });
}

function GitCopyCloneUrlButton(props: { protocol?: "http" | "ssh"; repositoryKey: string }) {
  const ui = useGitRepositoryUi();
  const value = ui.branding.getCloneUrl?.(props.repositoryKey, props.protocol || "http") || "";
  return h("button", {
    className: "git-browser-action-button",
    disabled: !value,
    onClick: async () => {
      try {
        const clipboard = (globalThis as typeof globalThis & {
          navigator?: {
            clipboard?: {
              writeText?: (value: string) => Promise<void>;
            };
          };
        }).navigator?.clipboard;
        if (value && clipboard?.writeText) await clipboard.writeText(value);
      } catch {}
    },
    type: "button",
    children: "Copy Clone URL",
  });
}

function GitRepositoryActionBar(props: { children?: ReactNode; className?: string }) {
  return h("div", {
    className: joinClassNames("git-browser-header-actions", props.className),
    children: props.children,
  });
}

function GitPathBreadcrumbs(props: { path?: string; repositoryKey: string; refName?: string }) {
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  const parts = text(props.path).split("/").filter(Boolean);
  let current = "";

  return h("div", {
    className: "git-browser-breadcrumbs",
    children: [
      h("button", {
        className: "git-browser-breadcrumb",
        key: "root",
        onClick: () => ui.navigate(routes.code(props.repositoryKey, "", props.refName)),
        type: "button",
        children: props.refName || "root",
      }),
      ...parts.map((part, index) => {
        current = current ? `${current}/${part}` : part;
        return h("button", {
          className: "git-browser-breadcrumb",
          key: `${part}:${index}`,
          onClick: () => ui.navigate(routes.code(props.repositoryKey, current, props.refName)),
          type: "button",
          children: part,
        });
      }),
    ],
  });
}

function GitRepositoryHeader(props: {
  actions?: ReactNode;
  className?: string;
  page: GitRepositoryPageKey;
  repositoryKey: string;
  social?: GitForgeSocialState | null;
  stats?: Array<{ label: string; value: ReactNode }>;
  subtitle?: string;
  title?: string;
}) {
  const ui = useGitRepositoryUi();
  return h("section", {
    className: joinClassNames("git-browser-hero", props.className, ui.theme.className),
    style: ui.themeStyle,
    children: [
      h("div", {
        className: "git-browser-hero-top",
        key: "title",
        children: [
          h("div", {
            className: "git-browser-title-block",
            key: "block",
            children: [
              h("div", { className: "git-browser-badge", key: "badge", children: "Embeddable Forge UI" }),
              h("h1", { className: joinClassNames("git-browser-title", ui.theme.typography?.headingClassName), key: "title", children: props.title || props.repositoryKey }),
              h("p", {
                className: joinClassNames("git-browser-subtitle", ui.theme.typography?.bodyClassName),
                key: "subtitle",
                children: props.subtitle || (typeof ui.branding.subtitle === "string" ? ui.branding.subtitle : "Repository workspace"),
              }),
            ],
          }),
          props.actions ? h("div", { className: "git-browser-header-actions", key: "actions", children: props.actions }) : null,
        ],
      }),
      props.stats?.length ? h(GitRepositoryStats, {
        key: "stats",
        repositoryKey: props.repositoryKey,
        social: props.social,
        stats: props.stats,
      }) : null,
      h(GitRepositoryTabs, {
        active: props.page,
        key: "tabs",
        repositoryKey: props.repositoryKey,
      }),
    ],
  });
}

function GitRepositoryShell(props: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  empty?: boolean;
  emptyState?: ReactNode;
  error?: Error | null;
  loading?: boolean;
  page: GitRepositoryPageKey;
  repositoryKey: string;
  retry?: () => void;
  social?: GitForgeSocialState | null;
  stats?: Array<{ label: string; value: ReactNode }>;
  subtitle?: string;
  title?: string;
}) {
  useGitRepositoryRenderState(props.page, props.repositoryKey, {
    empty: props.empty,
    error: props.error,
    loading: props.loading,
  });

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(GitRepositoryHeader, {
        actions: props.actions,
        key: "header",
        page: props.page,
        repositoryKey: props.repositoryKey,
        social: props.social,
        stats: props.stats,
        subtitle: props.subtitle,
        title: props.title,
      }),
      props.loading
        ? h(GitLoadingState, { key: "loading" })
        : props.error
          ? h(GitErrorState, { error: props.error, key: "error", onRetry: props.retry })
          : props.empty
            ? (props.emptyState || h(GitEmptyState, { key: "empty" }))
            : h("div", { className: "git-browser-shell-body", key: "body", children: props.children }),
    ],
  });
}

function GitCommitList(props: { commits: GitCommitSummary[]; repositoryKey: string; emptyMessage?: string }) {
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.commits.length) {
    return h(GitEmptyState, { message: props.emptyMessage || "No commits matched this repository view." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: props.commits.map((commit) => h("li", {
      className: "git-browser-list-item",
      key: commit.hash,
      children: [
        h("button", {
          className: "git-browser-list-link",
          key: "subject",
          onClick: () => ui.navigate(routes.commit(props.repositoryKey, commit.hash)),
          type: "button",
          children: `${commit.short_hash} · ${commit.subject}`,
        }),
        h("div", { className: "git-browser-note", key: "meta", children: `${commit.author_name} · ${formatDate(commit.authored_at)}` }),
      ],
    })),
  });
}

function GitReleaseList(props: { releases: GitForgeRelease[]; repositoryKey: string; emptyMessage?: string }) {
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.releases.length) {
    return h(GitEmptyState, { message: props.emptyMessage || "No releases have been published yet." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: props.releases.map((release) => h("li", {
      className: "git-browser-list-item",
      key: release.id,
      children: [
        h("button", {
          className: "git-browser-list-link",
          key: "title",
          onClick: () => ui.navigate(routes.release(props.repositoryKey, release.id)),
          type: "button",
          children: `${release.title} · ${release.tag_name}`,
        }),
        h("div", { className: "git-browser-note", key: "meta", children: `${release.prerelease ? "Prerelease" : "Release"} · ${formatDate(release.published_at || release.created_at)}` }),
        h("p", { className: "git-browser-note", key: "notes", children: release.notes || "No release notes." }),
      ],
    })),
  });
}

function GitForkList(props: { forks: GitForgeFork[]; repositoryKey: string; headers?: GitApiClientHeaders }) {
  if (!props.forks.length) {
    return h(GitEmptyState, { message: "No forks exist for this repository yet." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: props.forks.map((fork) => h("li", {
      className: "git-browser-list-item",
      key: fork.fork_repository_id,
      children: [
        h("strong", { key: "name", children: fork.fork_repository_id }),
        h("div", { className: "git-browser-note", key: "meta", children: `Ahead ${fork.fork_status.ahead} · Behind ${fork.fork_status.behind} · ${fork.fork_status.fork_branch}` }),
        h(GitSyncForkButton, { forkId: fork.fork_repository_id, headers: props.headers, key: "sync", repositoryKey: props.repositoryKey }),
      ],
    })),
  });
}

function GitTreeView(props: { entries: GitTreeEntry[]; onSelectPath?: (path: string) => void; selectedPath?: string }) {
  if (!props.entries.length) {
    return h(GitEmptyState, { message: "This tree is empty." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: props.entries.map((entry) => h("li", {
      className: joinClassNames("git-browser-list-item", entry.path === props.selectedPath && "is-selected"),
      key: entry.path,
      children: h("button", {
        className: "git-browser-list-link",
        onClick: () => props.onSelectPath?.(entry.path),
        type: "button",
        children: `${entry.type === "tree" ? "dir" : "file"} · ${entry.path}${entry.language ? ` · ${entry.language}` : ""}`,
      }),
    })),
  });
}

function GitBlobView(props: { content?: string; path?: string; subtitle?: string }) {
  return h("section", {
    className: "git-browser-card",
    children: [
      h("div", {
        className: "git-browser-card-header",
        key: "header",
        children: [
          h("h2", { className: "git-browser-card-title", key: "title", children: props.path || "File Preview" }),
          props.subtitle ? h("div", { className: "git-browser-card-subtitle", key: "subtitle", children: props.subtitle }) : null,
        ],
      }),
      props.content
        ? h("pre", { className: "git-browser-code-block", key: "body", children: props.content })
        : h(GitEmptyState, { key: "empty", message: "Select a file to preview its content." }),
    ],
  });
}

function GitSearchResults(props: { repositoryKey: string; results: GitSearchResult | null }) {
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  const files = props.results?.files || [];
  if (!files.length) {
    return h(GitEmptyState, { message: "No search results matched that query." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: files.map((file) => h("li", {
      className: "git-browser-list-item",
      key: file.path,
      children: [
        h("button", {
          className: "git-browser-list-link",
          key: "path",
          onClick: () => ui.navigate(routes.code(props.repositoryKey, file.path, props.results?.ref)),
          type: "button",
          children: `${file.path} · ${file.match_count} matches`,
        }),
        ...file.matches.slice(0, 5).map((match, index) => h("div", {
          className: "git-browser-note",
          key: `${file.path}:${index}`,
          children: `${match.line_number}: ${match.line}`,
        })),
      ],
    })),
  });
}

function GitActivityList(props: { activity: GitForgeActivityEntry[] }) {
  if (!props.activity.length) {
    return h(GitEmptyState, { message: "There is no recorded activity yet." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: props.activity.map((entry) => h("li", {
      className: "git-browser-list-item",
      key: entry.id,
      children: [
        h("strong", { key: "summary", children: entry.summary }),
        h("div", { className: "git-browser-note", key: "meta", children: `${entry.kind} · actor ${entry.actor_id} · ${formatDate(entry.created_at)}` }),
      ],
    })),
  });
}

function GitBranchList(props: { branches: GitBranchSummary[]; repositoryKey: string }) {
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.branches.length) {
    return h(GitEmptyState, { message: "No branches are available." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: props.branches.map((branch) => h("li", {
      className: "git-browser-list-item",
      key: branch.name,
      children: [
        h("button", {
          className: "git-browser-list-link",
          key: "branch",
          onClick: () => ui.navigate(routes.code(props.repositoryKey, "", branch.name)),
          type: "button",
          children: branch.current ? `${branch.name} (current)` : branch.name,
        }),
        h("div", { className: "git-browser-note", key: "meta", children: `${branch.head_commit.slice(0, 7)}${branch.upstream ? ` · ${branch.upstream}` : ""}` }),
      ],
    })),
  });
}

function GitTagList(props: { repositoryKey: string; tags: GitTagSummary[] }) {
  const ui = useGitRepositoryUi();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.tags.length) {
    return h(GitEmptyState, { message: "No tags exist yet." });
  }
  return h("ul", {
    className: "git-browser-list",
    children: props.tags.map((tag) => h("li", {
      className: "git-browser-list-item",
      key: tag.name,
      children: [
        h("button", {
          className: "git-browser-list-link",
          key: "tag",
          onClick: () => ui.navigate(routes.code(props.repositoryKey, "", tag.name)),
          type: "button",
          children: tag.name,
        }),
        h("div", { className: "git-browser-note", key: "meta", children: `${tag.short_hash} · ${tag.subject || "No subject"}` }),
      ],
    })),
  });
}

function GitBlameView(props: { blame: GitBlame | null; repositoryKey: string; refName?: string }) {
  const routes = useGitRepositoryRouteAdapter();
  const ui = useGitRepositoryUi();
  if (!props.blame || !props.blame.lines.length) {
    return h(GitEmptyState, { message: "No blame lines were available for this file." });
  }
  return h("div", {
    className: "git-browser-blame",
    children: props.blame.lines.map((line) => h("div", {
      className: "git-browser-blame-row",
      key: `${line.line_number}:${line.commit_hash}`,
      children: [
        h("button", {
          className: "git-browser-blame-commit",
          key: "commit",
          onClick: () => ui.navigate(routes.commit(props.repositoryKey, line.commit_hash)),
          type: "button",
          children: line.commit_short_hash,
        }),
        h("div", { className: "git-browser-note", key: "meta", children: `${line.author_name} · ${formatDate(line.authored_at)}` }),
        h("pre", { className: "git-browser-code-inline", key: "content", children: line.content }),
      ],
    })),
  });
}

function GitDiffView(props: { diff: GitCompareSummary | null }) {
  if (!props.diff) {
    return h(GitEmptyState, { message: "No comparison data is available." });
  }
  return h("div", {
    className: "git-browser-grid",
    children: [
      h("section", {
        className: "git-browser-card",
        key: "summary",
        children: [
          h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Compare Summary" }) }),
          h("dl", {
            className: "git-browser-definition-grid",
            key: "body",
            children: [
              h("dt", { key: "base:label", children: "Base" }),
              h("dd", { key: "base:value", children: props.diff.base_ref }),
              h("dt", { key: "head:label", children: "Head" }),
              h("dd", { key: "head:value", children: props.diff.head_ref }),
              h("dt", { key: "commits:label", children: "Commits" }),
              h("dd", { key: "commits:value", children: String(props.diff.commit_count) }),
              h("dt", { key: "files:label", children: "Files" }),
              h("dd", { key: "files:value", children: String(props.diff.file_count) }),
            ],
          }),
        ],
      }),
      h("section", {
        className: "git-browser-card git-browser-span-2",
        key: "diff",
        children: [
          h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Diff" }) }),
          h("pre", { className: "git-browser-code-block", key: "body", children: props.diff.diff }),
        ],
      }),
    ],
  });
}

export {
  GitActivityList,
  GitBlameView,
  GitBlobView,
  GitBranchList,
  GitBranchSelector,
  GitCommitList,
  GitCopyCloneUrlButton,
  GitCreateReleaseButton,
  GitDeleteReleaseButton,
  GitDiffView,
  GitDownloadArchiveButton,
  GitEditReleaseButton,
  GitEmptyState,
  GitErrorState,
  GitForkButton,
  GitForkList,
  GitLoadingState,
  GitPathBreadcrumbs,
  GitReleaseList,
  GitRepositoryActionBar,
  GitRepositoryHeader,
  GitRepositoryShell,
  GitRepositorySocialButtons,
  GitRepositoryStats,
  GitRepositoryTabs,
  GitRepositoryUiProvider,
  GitSearchResults,
  GitStarButton,
  GitSyncForkButton,
  GitTagList,
  GitTagSelector,
  GitTreeView,
  GitWatchButton,
};

export type { GitRepositoryUiProviderProps };
