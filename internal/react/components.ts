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
  resolveGitRepositorySlotProps,
  useGitRepositoryClassName,
  useGitRepositoryDiagnostics,
  useGitRepositoryRouteAdapter,
  useGitRepositoryUi,
  type GitRepositoryUiSlot,
  type GitRepositoryPageKey,
  type GitRepositoryEmptyStateProps,
  type GitRepositoryErrorStateProps,
  type GitRepositoryLoadingStateProps,
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
  GitSourceArchiveLinks,
  GitTagSummary,
  GitTreeEntry,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

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

function useGitRepositorySlots() {
  const ui = useGitRepositoryUi();
  return (slot: GitRepositoryUiSlot, input: Record<string, unknown> = {}) => resolveGitRepositorySlotProps(ui, slot, input);
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
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const Override = ui.components.LoadingState;
  if (Override) return h(Override, props as GitRepositoryLoadingStateProps);
  return h("div", slot("loading-state", {
    className: useGitRepositoryClassName("status", props.className),
    children: props.message || "Loading repository data...",
  }));
}

function GitErrorState(props: { error: Error | null; onRetry?: () => void; className?: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const Override = ui.components.ErrorState;
  if (Override) return h(Override, props as GitRepositoryErrorStateProps);
  return h("div", slot("error-state", {
    className: useGitRepositoryClassName("status", "is-error", props.className),
    children: [
      h("div", { key: "message", children: props.error?.message || "This repository view failed to load." }),
      props.onRetry
        ? h("button", {
          ...slot("button", {}),
          key: "retry",
          onClick: props.onRetry,
          type: "button",
          children: "Retry",
        })
        : null,
    ],
  }));
}

function GitEmptyState(props: { title?: string; message?: string; action?: ReactNode; className?: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const Override = ui.components.EmptyState;
  if (Override) return h(Override, props as GitRepositoryEmptyStateProps);
  return h("section", slot("empty-state", {
    className: props.className,
    children: [
      h("h3", slot("empty-title", { key: "title", children: props.title || "Nothing here yet" })),
      h("p", slot("note", { key: "message", children: props.message || "This repository section is empty." })),
      props.action ? h("div", slot("empty-action", { key: "action", children: props.action })) : null,
    ],
  }));
}

function GitRepositoryTabs(props: {
  active: GitRepositoryPageKey;
  className?: string;
  repositoryKey: string;
}) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  const activeClassName = useGitRepositoryClassName("button-active");
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

  return h("nav", slot("tabs", {
    className: props.className,
    children: items.map((item) => h("button", {
      ...slot("tab-link", {
        className: item.key === props.active ? activeClassName : undefined,
      }),
      key: item.key,
      onClick: () => ui.navigate(item.to),
      type: "button",
      children: item.label,
    })),
  }));
}

function GitRepositoryStats(props: {
  className?: string;
  repositoryKey: string;
  social?: GitForgeSocialState | null;
  stats: Array<{ label: string; value: ReactNode }>;
}) {
  const slot = useGitRepositorySlots();
  return h("dl", slot("stats", {
    className: useGitRepositoryClassName("definition-grid", props.className),
    children: props.stats.flatMap((entry) => ([
      h("dt", { key: `${entry.label}:label`, children: entry.label }),
      h("dd", { key: `${entry.label}:value`, children: entry.value }),
    ])),
  }));
}

function GitStarButton(props: {
  headers?: GitApiClientHeaders;
  repositoryKey: string;
  social?: GitForgeSocialState | null;
}) {
  const [optimistic, setOptimistic] = useState<GitForgeSocialState | null>(props.social || null);
  const slot = useGitRepositorySlots();
  const activeClassName = useGitRepositoryClassName("button-active");
  const star = useGitStarRepository(props.repositoryKey, { headers: props.headers });
  const unstar = useGitUnstarRepository(props.repositoryKey, { headers: props.headers });
  useEffect(() => {
    setOptimistic(props.social || null);
  }, [props.social]);

  return h("button", {
    ...slot("button", {
      className: optimistic?.viewer_has_starred ? activeClassName : undefined,
    }),
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
  const slot = useGitRepositorySlots();
  const activeClassName = useGitRepositoryClassName("button-active");
  const watch = useGitWatchRepository(props.repositoryKey, { headers: props.headers });
  const unwatch = useGitUnwatchRepository(props.repositoryKey, { headers: props.headers });
  useEffect(() => {
    setOptimistic(props.social || null);
  }, [props.social]);

  return h("button", {
    ...slot("button", {
      className: optimistic?.viewer_is_watching ? activeClassName : undefined,
    }),
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
  const slot = useGitRepositorySlots();
  return h("button", {
    ...slot("button", {
      className: useGitRepositoryClassName("button-primary"),
    }),
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
  const slot = useGitRepositorySlots();
  return h("button", {
    ...slot("button", {}),
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
  const slot = useGitRepositorySlots();
  return h("button", {
    ...slot("button", {
      className: useGitRepositoryClassName("button-primary"),
    }),
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
  const slot = useGitRepositorySlots();
  return h("button", {
    ...slot("button", {}),
    disabled: props.disabled,
    onClick: props.onClick,
    type: "button",
    children: "Edit Release",
  });
}

function GitDeleteReleaseButton(props: { headers?: GitApiClientHeaders; releaseId: string; repositoryKey: string; deleteTag?: boolean; onDeleted?: () => void }) {
  const mutation = useGitDeleteRelease(props.repositoryKey, props.releaseId, { headers: props.headers });
  const slot = useGitRepositorySlots();
  return h("button", {
    ...slot("button", {}),
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
  const slot = useGitRepositorySlots();
  return h("div", {
    ...slot("actions", {}),
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
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  return h("select", {
    ...slot("input", { className: props.className }),
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
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  return h("select", {
    ...slot("input", { className: props.className }),
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

function GitDownloadArchiveButton(props: { format?: "tar.gz" | "zip"; label?: string; refName?: string; repositoryKey: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const links = ui.client?.getArchiveLinks(props.repositoryKey, {
    ref: props.refName,
  });
  const href = (props.format || "zip") === "zip" ? links?.zip.href : links?.tar_gz.href;
  return h("a", {
    ...slot("button", {}),
    href,
    children: props.label || ((props.format || "zip") === "zip" ? "Download ZIP" : "Download TAR.GZ"),
  });
}

function GitSourceArchiveLinksRow(props: { links?: GitSourceArchiveLinks | null }) {
  const slot = useGitRepositorySlots();
  if (!props.links) return null;
  return h("div", {
    ...slot("action-bar", {}),
    children: [
      h("a", {
        ...slot("button", {}),
        href: props.links.zip.href,
        key: "zip",
        children: "Source code (zip)",
      }),
      h("a", {
        ...slot("button", {}),
        href: props.links.tar_gz.href,
        key: "tar_gz",
        children: "Source code (tar.gz)",
      }),
    ],
  });
}

function GitCopyCloneUrlButton(props: { protocol?: "http" | "ssh"; repositoryKey: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const value = ui.branding.getCloneUrl?.(props.repositoryKey, props.protocol || "http") || "";
  return h("button", {
    ...slot("button", {}),
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
  const slot = useGitRepositorySlots();
  return h("div", slot("action-bar", {
    className: props.className,
    children: props.children,
  }));
}

function GitPathBreadcrumbs(props: { path?: string; repositoryKey: string; refName?: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  const parts = text(props.path).split("/").filter(Boolean);
  let current = "";

  return h("div", {
    ...slot("breadcrumbs", {}),
    children: [
      h("button", {
        ...slot("breadcrumb", {}),
        key: "root",
        onClick: () => ui.navigate(routes.code(props.repositoryKey, "", props.refName)),
        type: "button",
        children: props.refName || "root",
      }),
      ...parts.map((part, index) => {
        current = current ? `${current}/${part}` : part;
        return h("button", {
          ...slot("breadcrumb", {}),
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
  const slot = useGitRepositorySlots();
  return h("section", slot("header", {
    className: joinClassNames(props.className, ui.theme.className),
    style: ui.themeStyle,
    children: [
      h("div", slot("header-top", {
        key: "title",
        children: [
          h("div", slot("title-block", {
            key: "block",
            children: [
              h("div", slot("badge", { key: "badge", children: "Embeddable Forge UI" })),
              h("h1", slot("title", {
                className: ui.theme.typography?.headingClassName,
                key: "title",
                children: props.title || props.repositoryKey,
              })),
              h("p", slot("subtitle", {
                className: ui.theme.typography?.bodyClassName,
                key: "subtitle",
                children: props.subtitle || (typeof ui.branding.subtitle === "string" ? ui.branding.subtitle : "Repository workspace"),
              })),
            ],
          })),
          props.actions ? h("div", slot("header-actions", { key: "actions", children: props.actions })) : null,
        ],
      })),
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
  }));
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

  const slot = useGitRepositorySlots();
  return h("div", slot("page", {
    className: props.className,
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
            : h("div", slot("shell-body", { key: "body", children: props.children })),
    ],
  }));
}

function GitCommitList(props: { commits: GitCommitSummary[]; repositoryKey: string; emptyMessage?: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.commits.length) {
    return h(GitEmptyState, { message: props.emptyMessage || "No commits matched this repository view." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: props.commits.map((commit) => h("li", {
      ...slot("list-item", {}),
      key: commit.hash,
      children: [
        h("button", {
          ...slot("list-link", {}),
          key: "subject",
          onClick: () => ui.navigate(routes.commit(props.repositoryKey, commit.hash)),
          type: "button",
          children: `${commit.short_hash} · ${commit.subject}`,
        }),
        h("div", slot("note", { key: "meta", children: `${commit.author_name} · ${formatDate(commit.authored_at)}` })),
      ],
    })),
  });
}

function GitReleaseList(props: { releases: GitForgeRelease[]; repositoryKey: string; emptyMessage?: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.releases.length) {
    return h(GitEmptyState, { message: props.emptyMessage || "No releases have been published yet." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: props.releases.map((release) => h("li", {
      ...slot("list-item", {}),
      key: release.id,
      children: [
        h("button", {
          ...slot("list-link", {}),
          key: "title",
          onClick: () => ui.navigate(routes.release(props.repositoryKey, release.id)),
          type: "button",
          children: `${release.title} · ${release.tag_name}`,
        }),
        h("div", slot("note", { key: "meta", children: `${release.prerelease ? "Prerelease" : "Release"} · ${formatDate(release.published_at || release.created_at)}` })),
        h("p", slot("note", { key: "notes", children: release.notes || "No release notes." })),
        h(GitSourceArchiveLinksRow, { key: "archives", links: release.source_archives }),
      ],
    })),
  });
}

function GitForkList(props: { forks: GitForgeFork[]; repositoryKey: string; headers?: GitApiClientHeaders }) {
  const slot = useGitRepositorySlots();
  if (!props.forks.length) {
    return h(GitEmptyState, { message: "No forks exist for this repository yet." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: props.forks.map((fork) => h("li", {
      ...slot("list-item", {}),
      key: fork.fork_repository_id,
      children: [
        h("strong", { key: "name", children: fork.fork_repository_id }),
        h("div", slot("note", { key: "meta", children: `Ahead ${fork.fork_status.ahead} · Behind ${fork.fork_status.behind} · ${fork.fork_status.fork_branch}` })),
        h(GitSyncForkButton, { forkId: fork.fork_repository_id, headers: props.headers, key: "sync", repositoryKey: props.repositoryKey }),
      ],
    })),
  });
}

function GitTreeView(props: { entries: GitTreeEntry[]; onSelectPath?: (path: string) => void; selectedPath?: string }) {
  const slot = useGitRepositorySlots();
  if (!props.entries.length) {
    return h(GitEmptyState, { message: "This tree is empty." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: props.entries.map((entry) => h("li", {
      ...slot("list-item", {
        className: entry.path === props.selectedPath ? "is-selected" : undefined,
      }),
      key: entry.path,
      children: h("button", {
        ...slot("list-link", {}),
        onClick: () => props.onSelectPath?.(entry.path),
        type: "button",
        children: `${entry.type === "tree" ? "dir" : "file"} · ${entry.path}${entry.language ? ` · ${entry.language}` : ""}`,
      }),
    })),
  });
}

function GitBlobView(props: { content?: string; path?: string; subtitle?: string }) {
  const slot = useGitRepositorySlots();
  return h("section", slot("card", {
    children: [
      h("div", slot("card-header", {
        key: "header",
        children: [
          h("h2", slot("card-title", { key: "title", children: props.path || "File Preview" })),
          props.subtitle ? h("div", slot("card-subtitle", { key: "subtitle", children: props.subtitle })) : null,
        ],
      })),
      props.content
        ? h("pre", slot("code-block", { key: "body", children: props.content }))
        : h(GitEmptyState, { key: "empty", message: "Select a file to preview its content." }),
    ],
  }));
}

function GitSearchResults(props: { repositoryKey: string; results: GitSearchResult | null }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  const files = props.results?.files || [];
  if (!files.length) {
    return h(GitEmptyState, { message: "No search results matched that query." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: files.map((file) => h("li", {
      ...slot("list-item", {}),
      key: file.path,
      children: [
        h("button", {
          ...slot("list-link", {}),
          key: "path",
          onClick: () => ui.navigate(routes.code(props.repositoryKey, file.path, props.results?.ref)),
          type: "button",
          children: `${file.path} · ${file.match_count} matches`,
        }),
        ...file.matches.slice(0, 5).map((match, index) => h("div", slot("note", {
          key: `${file.path}:${index}`,
          children: `${match.line_number}: ${match.line}`,
        }))),
      ],
    })),
  });
}

function GitActivityList(props: { activity: GitForgeActivityEntry[] }) {
  const slot = useGitRepositorySlots();
  if (!props.activity.length) {
    return h(GitEmptyState, { message: "There is no recorded activity yet." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: props.activity.map((entry) => h("li", {
      ...slot("list-item", {}),
      key: entry.id,
      children: [
        h("strong", { key: "summary", children: entry.summary }),
        h("div", slot("note", { key: "meta", children: `${entry.kind} · actor ${entry.actor_id} · ${formatDate(entry.created_at)}` })),
      ],
    })),
  });
}

function GitBranchList(props: { branches: GitBranchSummary[]; repositoryKey: string }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.branches.length) {
    return h(GitEmptyState, { message: "No branches are available." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: props.branches.map((branch) => h("li", {
      ...slot("list-item", {}),
      key: branch.name,
      children: [
        h("button", {
          ...slot("list-link", {}),
          key: "branch",
          onClick: () => ui.navigate(routes.code(props.repositoryKey, "", branch.name)),
          type: "button",
          children: branch.current ? `${branch.name} (current)` : branch.name,
        }),
        h("div", slot("note", { key: "meta", children: `${branch.head_commit.slice(0, 7)}${branch.upstream ? ` · ${branch.upstream}` : ""}` })),
      ],
    })),
  });
}

function GitTagList(props: { repositoryKey: string; tags: GitTagSummary[] }) {
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  const routes = useGitRepositoryRouteAdapter();
  if (!props.tags.length) {
    return h(GitEmptyState, { message: "No tags exist yet." });
  }
  return h("ul", {
    ...slot("list", {}),
    children: props.tags.map((tag) => h("li", {
      ...slot("list-item", {}),
      key: tag.name,
      children: [
        h("button", {
          ...slot("list-link", {}),
          key: "tag",
          onClick: () => ui.navigate(routes.code(props.repositoryKey, "", tag.name)),
          type: "button",
          children: tag.name,
        }),
        h("div", slot("note", { key: "meta", children: `${tag.short_hash} · ${tag.subject || "No subject"}` })),
        h(GitSourceArchiveLinksRow, { key: "archives", links: tag.source_archives }),
      ],
    })),
  });
}

function GitBlameView(props: { blame: GitBlame | null; repositoryKey: string; refName?: string }) {
  const routes = useGitRepositoryRouteAdapter();
  const ui = useGitRepositoryUi();
  const slot = useGitRepositorySlots();
  if (!props.blame || !props.blame.lines.length) {
    return h(GitEmptyState, { message: "No blame lines were available for this file." });
  }
  return h("div", {
    ...slot("blame", {}),
    children: props.blame.lines.map((line) => h("div", {
      ...slot("blame-row", {}),
      key: `${line.line_number}:${line.commit_hash}`,
      children: [
        h("button", {
          ...slot("blame-commit", {}),
          key: "commit",
          onClick: () => ui.navigate(routes.commit(props.repositoryKey, line.commit_hash)),
          type: "button",
          children: line.commit_short_hash,
        }),
        h("div", slot("note", { key: "meta", children: `${line.author_name} · ${formatDate(line.authored_at)}` })),
        h("pre", slot("code-inline", { key: "content", children: line.content })),
      ],
    })),
  });
}

function GitDiffView(props: { diff: GitCompareSummary | null }) {
  const slot = useGitRepositorySlots();
  if (!props.diff) {
    return h(GitEmptyState, { message: "No comparison data is available." });
  }
  return h("div", slot("grid", {
    children: [
      h("section", slot("card", {
        key: "summary",
        children: [
          h("div", slot("card-header", { key: "header", children: h("h2", slot("card-title", { children: "Compare Summary" })) })),
          h("dl", slot("definition-grid", {
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
          })),
        ],
      })),
      h("section", slot("card", {
        className: "git-browser-span-2",
        key: "diff",
        children: [
          h("div", slot("card-header", { key: "header", children: h("h2", slot("card-title", { children: "Diff" })) })),
          h("pre", slot("code-block", { key: "body", children: props.diff.diff })),
        ],
      })),
    ],
  }));
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
