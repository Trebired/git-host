import {
  createElement,
  useEffect,
  useDeferredValue,
  useState,
  type ReactNode,
} from "react";

import { createGitApiClient } from "#402c2u4czl3p";
import type { GitApiClient, GitApiClientHeaders } from "#402c2u4czl3p";
import {
  GitActivityList,
  GitApiClientProvider,
  GitBlameView,
  GitBlobView,
  GitBranchList,
  GitBranchSelector,
  useGitApiClient,
  GitCommitList,
  GitCopyCloneUrlButton,
  useGitCancelWorkflowRun,
  GitDeleteReleaseButton,
  GitDiffView,
  GitDownloadArchiveButton,
  GitEditReleaseButton,
  GitForkButton,
  GitForkList,
  GitPathBreadcrumbs,
  GitReleaseList,
  GitRepositoryActionBar,
  GitRepositoryShell,
  GitRepositorySocialButtons,
  GitRepositoryUiProvider,
  GitSearchResults,
  GitTagList,
  GitTagSelector,
  GitTreeView,
  useGitActivity,
  useGitBlame,
  useGitBlob,
  useGitBranches,
  useGitCommit,
  useGitCommits,
  useGitCreateWorkflow,
  useGitDiff,
  useGitForks,
  useGitCreateRelease,
  useGitOverview,
  useGitRelease,
  useGitReleases,
  useGitRepositoryRouteAdapter,
  useGitRunWorkflow,
  useGitSearch,
  useGitTags,
  useGitTree,
  useGitUpdateRelease,
  useGitUpdateWorkflow,
  useGitWorkflow,
  useGitWorkflowRun,
  useGitWorkflowRunEvents,
  useGitWorkflowRuns,
  useGitWorkflowRunSteps,
  useGitWorkflows,
  type GitRepositoryUiProviderProps,
  type GitRepositoryUiTheme,
} from "#qrrrat6gjo0q";
import type { GitRepositoryFrontEndInitialData, GitRepositoryRouteAdapter } from "#jtzr4xu4q8bf";
import type {
  GitForgeRelease,
  GitForgeRepositoryOverview,
  GitForgeWorkflow,
  GitForgeWorkflowRun,
  GitForgeWorkflowRunEvent,
  GitForgeWorkflowRunStep,
} from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

const h = createElement;

type GitBrowserProviderProps = GitRepositoryUiProviderProps & {
  baseUrl?: string;
  children?: ReactNode;
  client?: GitApiClient;
  headers?: GitApiClientHeaders;
  unstyled?: boolean;
};

type GitBrowserPageProps = GitRepositoryUiProviderProps & {
  baseUrl?: string;
  className?: string;
  client?: GitApiClient;
  headers?: GitApiClientHeaders;
  initialData?: GitRepositoryFrontEndInitialData | null;
  repositoryKey: string;
  unstyled?: boolean;
};

type GitRepositoryCodePageProps = GitBrowserPageProps & {
  path?: string;
  refName?: string;
};

type GitRepositoryCommitsPageProps = GitBrowserPageProps & {
  path?: string;
  refName?: string;
};

type GitRepositoryCommitPageProps = GitBrowserPageProps & {
  commitRef: string;
};

type GitRepositoryReleasePageProps = GitBrowserPageProps & {
  releaseId: string;
};

type GitRepositoryBlamePageProps = GitBrowserPageProps & {
  path: string;
  refName?: string;
};

type GitRepositoryComparePageProps = GitBrowserPageProps & {
  baseRef: string;
  headRef: string;
  path?: string;
};

type GitRepositorySearchPageProps = GitBrowserPageProps & {
  path?: string;
  query?: string;
  refName?: string;
};

type GitRepositoryActionsPageProps = GitBrowserPageProps & {
  branch?: string;
  query?: string;
  refName?: string;
  status?: string;
  triggerKind?: string;
  workflowId?: string;
};

type GitRepositoryActionRunPageProps = GitBrowserPageProps & {
  runId: string;
};

function joinClassNames(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
}

function formatDateTime(value: string | null | undefined) {
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

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined) {
  const started = startedAt ? Date.parse(startedAt) : NaN;
  const finished = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return "Unknown";
  const totalSeconds = Math.floor((finished - started) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function parseCsvList(value: string): string[] | undefined {
  const next = value
    .split(",")
    .map((entry) => text(entry).trim())
    .filter(Boolean);
  return next.length ? next : undefined;
}

function parseWorkflowStepsInput(value: string): GitForgeWorkflow["steps"] {
  return value
    .split("\n")
    .map((entry) => text(entry).trim())
    .filter(Boolean)
    .map((run, index) => ({
      kind: "shell" as const,
      name: `Step ${index + 1}`,
      run,
    }));
}

function describeWorkflowScope(workflow: GitForgeWorkflow) {
  const branches = workflow.source?.branches?.length ? `branches: ${workflow.source.branches.join(", ")}` : "";
  const tags = workflow.source?.tags?.length ? `tags: ${workflow.source.tags.join(", ")}` : "";
  return [branches, tags].filter(Boolean).join(" · ") || "All refs";
}

function appendWorkflowEvent(
  current: GitForgeWorkflowRunEvent[],
  nextEvent: GitForgeWorkflowRunEvent,
): GitForgeWorkflowRunEvent[] {
  if (current.some((entry) => entry.id === nextEvent.id || entry.sequence === nextEvent.sequence)) {
    return current;
  }
  return [...current, nextEvent].sort((left, right) => left.sequence - right.sequence);
}

function renderWorkflowEventLine(event: GitForgeWorkflowRunEvent) {
  if (event.type === "step.output") {
    return `${formatDateTime(event.created_at)} ${event.stream === "stderr" ? "[stderr]" : "[stdout]"} ${text(event.chunk)}`;
  }
  if (event.type === "step.started") {
    return `${formatDateTime(event.created_at)} > ${text(event.step_name)} :: ${text(event.command)}`;
  }
  if (event.type === "step.finished") {
    return `${formatDateTime(event.created_at)} < ${text(event.step_name)} :: ${text(event.summary, text(event.status))}`;
  }
  return `${formatDateTime(event.created_at)} ${text(event.summary, event.type)}`;
}

function findReadme(entries: Array<{ name: string; path: string; type: string }>): string {
  const match = entries.find((entry) => entry.type === "blob" && /^readme(\.|$)/i.test(entry.name));
  return match ? match.path : "";
}

function createClient(options: GitBrowserProviderProps) {
  return options.client || createGitApiClient({
    baseUrl: text(options.baseUrl),
    headers: options.headers,
  });
}

function resolveTheme(
  theme: GitRepositoryUiTheme | undefined,
  unstyled?: boolean,
): GitRepositoryUiTheme | undefined {
  if (!unstyled) return theme;
  return {
    ...(theme || {}),
    unstyled: true,
  };
}

function GitBrowserProvider(props: GitBrowserProviderProps) {
  const [client] = useState(() => createClient(props));
  return h(GitApiClientProvider, {
    client,
    children: h(GitRepositoryUiProvider, {
      branding: props.branding,
      client,
      diagnostics: props.diagnostics,
      navigate: props.navigate,
      policy: props.policy,
      routeAdapter: props.routeAdapter,
      theme: resolveTheme(props.theme, props.unstyled),
      children: props.children,
    }),
  });
}

function withBrowserProvider(
  props: GitBrowserPageProps,
  render: () => ReactNode,
) {
  if (!props.client && !props.baseUrl) return render();
  return h(GitBrowserProvider, {
    baseUrl: props.baseUrl,
    branding: props.branding,
    client: props.client,
    diagnostics: props.diagnostics,
    headers: props.headers,
    navigate: props.navigate,
    policy: props.policy,
    routeAdapter: props.routeAdapter,
    theme: resolveTheme(props.theme, props.unstyled),
    unstyled: props.unstyled,
    children: render(),
  });
}

function overviewStats(overview: GitForgeRepositoryOverview | null | undefined) {
  if (!overview) return [];
  return [
    { label: "Branch", value: overview.repository.repository.current_branch },
    { label: "Head", value: overview.repository.repository.head_short },
    { label: "Stars", value: String(overview.social.star_count) },
    { label: "Watchers", value: String(overview.social.watcher_count) },
    { label: "Releases", value: String(overview.release_count) },
    { label: "Forks", value: String(overview.fork_count) },
  ];
}

function defaultSubtitle(repositoryKey: string, overview: GitForgeRepositoryOverview | null | undefined) {
  if (!overview) return `Repository workspace for ${repositoryKey}`;
  return `${overview.repository.repository.current_branch} branch · ${overview.release_count} releases · ${overview.fork_count} forks`;
}

function defaultActionBar(repositoryKey: string, headers?: GitApiClientHeaders) {
  return h(GitRepositoryActionBar, {
    children: [
      h(GitRepositorySocialButtons, { headers, key: "social", repositoryKey }),
      h(GitForkButton, { headers, key: "fork", repositoryKey }),
      h(GitCopyCloneUrlButton, { key: "clone", repositoryKey }),
      h(GitDownloadArchiveButton, { format: "zip", key: "archive-zip", repositoryKey }),
      h(GitDownloadArchiveButton, { format: "tar.gz", key: "archive-tar", repositoryKey }),
    ],
  });
}

function GitReleaseComposerCard(props: { headers?: GitApiClientHeaders; onCreated?: () => void; repositoryKey: string }) {
  const createRelease = useGitCreateRelease(props.repositoryKey, { headers: props.headers });
  const [title, setTitle] = useState("");
  const [tagName, setTagName] = useState("");
  const [notes, setNotes] = useState("");

  return h("section", {
    className: "git-browser-card",
    children: [
      h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Publish a Release" }) }),
      h("form", {
        className: "git-browser-form",
        key: "form",
        onSubmit: async (event: Event) => {
          event.preventDefault();
          await createRelease.mutate({
            createTag: {
              annotatedMessage: notes || title,
              name: tagName,
              targetRef: "HEAD",
            },
            notes,
            title,
          });
          setTitle("");
          setTagName("");
          setNotes("");
          props.onCreated?.();
        },
        children: [
          h("input", {
            className: "git-browser-input",
            key: "title",
            onChange: (event: any) => setTitle(text(event.target?.value)),
            placeholder: "Release title",
            value: title,
          }),
          h("input", {
            className: "git-browser-input",
            key: "tag",
            onChange: (event: any) => setTagName(text(event.target?.value)),
            placeholder: "Tag name",
            value: tagName,
          }),
          h("textarea", {
            className: "git-browser-input git-browser-textarea",
            key: "notes",
            onChange: (event: any) => setNotes(text(event.target?.value)),
            placeholder: "Release notes",
            value: notes,
          }),
          h("button", {
            className: "git-browser-action-button is-primary",
            disabled: createRelease.loading || !title || !tagName,
            key: "submit",
            type: "submit",
            children: createRelease.loading ? "Publishing..." : "Publish Release",
          }),
        ],
      }),
    ],
  });
}

function GitReleaseEditorCard(props: { headers?: GitApiClientHeaders; onDeleted?: () => void; onUpdated?: () => void; release: GitForgeRelease | null; repositoryKey: string }) {
  const updateRelease = useGitUpdateRelease(props.repositoryKey, text(props.release?.id), { headers: props.headers });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(text(props.release?.title));
  const [notes, setNotes] = useState(text(props.release?.notes));

  if (!props.release) return null;

  return h("section", {
    className: "git-browser-card",
    children: [
      h("div", {
        className: "git-browser-card-header",
        key: "header",
        children: [
          h("h2", { className: "git-browser-card-title", key: "title", children: "Release Actions" }),
          h("div", {
            className: "git-browser-actions",
            key: "actions",
            children: [
              h(GitEditReleaseButton, {
                key: "edit",
                onClick: () => setEditing((current) => !current),
              }),
              h(GitDeleteReleaseButton, {
                headers: props.headers,
                key: "delete",
                onDeleted: props.onDeleted,
                releaseId: props.release.id,
                repositoryKey: props.repositoryKey,
              }),
            ],
          }),
        ],
      }),
      editing
        ? h("div", {
          className: "git-browser-form",
          key: "editor",
          children: [
            h("input", {
              className: "git-browser-input",
              key: "title",
              onChange: (event: any) => setTitle(text(event.target?.value)),
              value: title,
            }),
            h("textarea", {
              className: "git-browser-input git-browser-textarea",
              key: "notes",
              onChange: (event: any) => setNotes(text(event.target?.value)),
              value: notes,
            }),
            h("button", {
              className: "git-browser-action-button is-primary",
              disabled: updateRelease.loading,
              key: "save",
              onClick: async () => {
                await updateRelease.mutate({ notes, title });
                setEditing(false);
                props.onUpdated?.();
              },
              type: "button",
              children: updateRelease.loading ? "Saving..." : "Save Release",
            }),
          ],
        })
        : h("p", { className: "git-browser-note", key: "summary", children: "Toggle edit mode to rename or rewrite release notes." }),
    ],
  });
}

function GitRepositoryOverviewPageInner(props: GitBrowserPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const tree = useGitTree(props.repositoryKey, {
    enabled: Boolean(overview.data),
    headers: props.headers,
    icons: true,
    recursive: true,
    ref: overview.data?.repository.repository.current_branch || "HEAD",
  });
  const readmePath = tree.data ? findReadme(tree.data) : "";
  const readme = useGitBlob(props.repositoryKey, {
    enabled: Boolean(readmePath),
    headers: props.headers,
    path: readmePath,
    ref: overview.data?.repository.repository.current_branch || "HEAD",
  });

  return h(GitRepositoryShell, {
    actions: defaultActionBar(props.repositoryKey, props.headers),
    className: props.className,
    error: overview.error,
    loading: overview.loading,
    page: "overview",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("div", {
      className: "git-browser-grid",
      children: [
        h("section", {
          className: "git-browser-card git-browser-span-2",
          key: "summary",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Repository Summary" }) }),
            h("p", { className: "git-browser-note", key: "path", children: overview.data?.repository.repository.path || "" }),
          ],
        }),
        h("section", {
          className: "git-browser-card",
          key: "latest-release",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Latest Release" }) }),
            overview.data?.latest_release
              ? h(GitReleaseList, { key: "list", releases: [overview.data.latest_release], repositoryKey: props.repositoryKey })
              : h("p", { className: "git-browser-note", key: "empty", children: "No releases published yet." }),
          ],
        }),
        h("section", {
          className: "git-browser-card git-browser-span-3",
          key: "readme",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "README" }) }),
            h(GitBlobView, { content: readme.data?.content, key: "blob", path: readmePath || "README" }),
          ],
        }),
      ],
    }),
  });
}

function GitRepositoryCodePageInner(props: GitRepositoryCodePageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const [selectedPath, setSelectedPath] = useState(text(props.path));
  const deferredPath = useDeferredValue(selectedPath);
  const refName = props.refName || overview.data?.repository.repository.current_branch || "HEAD";
  const tree = useGitTree(props.repositoryKey, {
    headers: props.headers,
    icons: true,
    linguist: true,
    recursive: true,
    ref: refName,
  });
  const resolvedPath = deferredPath || (tree.data || []).find((entry) => entry.type === "blob")?.path || "";
  const selectedEntry = (tree.data || []).find((entry) => entry.path === resolvedPath) || null;
  const blob = useGitBlob(props.repositoryKey, {
    enabled: Boolean(selectedEntry && selectedEntry.type === "blob"),
    headers: props.headers,
    path: resolvedPath,
    ref: refName,
  });

  return h(GitRepositoryShell, {
    actions: h(GitRepositoryActionBar, {
      children: [
        h(GitBranchSelector, { headers: props.headers, key: "branch", repositoryKey: props.repositoryKey, selectedBranch: overview.data?.repository.repository.current_branch }),
        h(GitTagSelector, { headers: props.headers, key: "tag", repositoryKey: props.repositoryKey }),
      ],
    }),
    className: props.className,
    error: tree.error || blob.error,
    loading: overview.loading || tree.loading,
    page: "code",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("div", {
      className: "git-browser-split",
      children: [
        h("section", {
          className: "git-browser-card",
          key: "tree",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Repository Tree" }) }),
            h(GitTreeView, {
              entries: tree.data || [],
              key: "body",
              onSelectPath: setSelectedPath,
              selectedPath: resolvedPath,
            }),
          ],
        }),
        h("div", {
          className: "git-browser-grid",
          key: "blob",
          children: [
            h(GitPathBreadcrumbs, { key: "crumbs", path: resolvedPath, refName, repositoryKey: props.repositoryKey }),
            h(GitBlobView, {
              content: blob.data?.content,
              key: "view",
              path: resolvedPath,
              subtitle: selectedEntry?.language || "Plain text",
            }),
          ],
        }),
      ],
    }),
  });
}

function GitRepositoryCommitsPageInner(props: GitRepositoryCommitsPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const [limit, setLimit] = useState(20);
  const commits = useGitCommits(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.commits || null,
    limit,
    path: props.path,
    ref: props.refName || overview.data?.repository.repository.current_branch || "HEAD",
  });

  return h(GitRepositoryShell, {
    actions: h(GitRepositoryActionBar, {
      children: h(GitBranchSelector, { headers: props.headers, repositoryKey: props.repositoryKey, selectedBranch: overview.data?.repository.repository.current_branch }),
    }),
    className: props.className,
    error: commits.error,
    loading: overview.loading || commits.loading,
    page: "commits",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: props.path ? `History filtered to ${props.path}` : defaultSubtitle(props.repositoryKey, overview.data),
    children: h("section", {
      className: "git-browser-card",
      children: [
        h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Commit History" }) }),
        h(GitCommitList, { commits: commits.data || [], key: "list", repositoryKey: props.repositoryKey }),
        (commits.data || []).length >= limit
          ? h("button", {
            className: "git-browser-action-button",
            key: "more",
            onClick: () => setLimit((current) => current + 20),
            type: "button",
            children: "Load More Commits",
          })
          : null,
      ],
    }),
  });
}

function GitRepositoryCommitPageInner(props: GitRepositoryCommitPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const commit = useGitCommit(props.repositoryKey, props.commitRef, {
    headers: props.headers,
    initialData: props.initialData?.commit || null,
  });

  return h(GitRepositoryShell, {
    className: props.className,
    error: commit.error,
    loading: overview.loading || commit.loading,
    page: "commit",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: commit.data ? h("div", {
      className: "git-browser-grid",
      children: [
        h("section", {
          className: "git-browser-card git-browser-span-3",
          key: "meta",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: commit.data.commit.subject }) }),
            h("p", { className: "git-browser-note", key: "meta", children: `${commit.data.commit.short_hash} · ${commit.data.commit.author_name} · ${commit.data.file_count} files` }),
            h("pre", { className: "git-browser-code-block", key: "diff", children: commit.data.diff }),
          ],
        }),
      ],
    }) : null,
  });
}

function GitRepositoryReleasesPageInner(props: GitBrowserPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const releases = useGitReleases(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.releases || null,
  });

  return h(GitRepositoryShell, {
    actions: defaultActionBar(props.repositoryKey, props.headers),
    className: props.className,
    error: releases.error,
    loading: overview.loading || releases.loading,
    page: "releases",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("div", {
      className: "git-browser-grid",
      children: [
        h(GitReleaseComposerCard, {
          headers: props.headers,
          key: "composer",
          onCreated: releases.reload,
          repositoryKey: props.repositoryKey,
        }),
        h("section", {
          className: "git-browser-card git-browser-span-2",
          key: "list-card",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Releases" }) }),
            h(GitReleaseList, { key: "list", releases: releases.data || [], repositoryKey: props.repositoryKey }),
          ],
        }),
      ],
    }),
  });
}

function GitRepositoryReleasePageInner(props: GitRepositoryReleasePageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const release = useGitRelease(props.repositoryKey, props.releaseId, {
    headers: props.headers,
    initialData: props.initialData?.release || null,
  });

  return h(GitRepositoryShell, {
    actions: defaultActionBar(props.repositoryKey, props.headers),
    className: props.className,
    error: release.error,
    loading: overview.loading || release.loading,
    page: "release",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: release.data ? h("div", {
      className: "git-browser-grid",
      children: [
        h("section", {
          className: "git-browser-card git-browser-span-2",
          key: "details",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: `${release.data.title} · ${release.data.tag_name}` }) }),
            h("p", { className: "git-browser-note", key: "notes", children: release.data.notes || "No release notes." }),
          ],
        }),
        h("section", {
          className: "git-browser-card",
          key: "source-archives",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Source Code" }) }),
            release.data.source_archives
              ? h(GitRepositoryActionBar, {
                key: "links",
                children: [
                  h("a", { className: "git-browser-button", href: release.data.source_archives.zip.href, key: "zip", children: "Source code (zip)" }),
                  h("a", { className: "git-browser-button", href: release.data.source_archives.tar_gz.href, key: "tar", children: "Source code (tar.gz)" }),
                ],
              })
              : h("p", { className: "git-browser-note", key: "empty", children: "Source archives are unavailable for this release tag." }),
          ],
        }),
        h("section", {
          className: "git-browser-card",
          key: "assets",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Assets" }) }),
            release.data.assets.length
              ? h("ul", {
                className: "git-browser-list",
                key: "list",
                children: release.data.assets.map((asset) => h("li", {
                  className: "git-browser-list-item",
                  key: asset.id,
                  children: asset.download_url
                    ? h("a", { className: "git-browser-link", href: asset.download_url, children: `${asset.name}${asset.size ? ` · ${asset.size} bytes` : ""}` })
                    : `${asset.name}${asset.size ? ` · ${asset.size} bytes` : ""}`,
                })),
              })
              : h("p", { className: "git-browser-note", key: "empty", children: "No uploaded release assets." }),
          ],
        }),
        h(GitReleaseEditorCard, {
          headers: props.headers,
          key: "editor",
          onDeleted: release.reload,
          onUpdated: release.reload,
          release: release.data,
          repositoryKey: props.repositoryKey,
        }),
      ],
    }) : null,
  });
}

function GitRepositoryForksPageInner(props: GitBrowserPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const forks = useGitForks(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.forks || null,
  });

  return h(GitRepositoryShell, {
    actions: defaultActionBar(props.repositoryKey, props.headers),
    className: props.className,
    error: forks.error,
    loading: overview.loading || forks.loading,
    page: "forks",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("section", {
      className: "git-browser-card",
      children: [
        h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Fork Network" }) }),
        h(GitForkList, { forks: forks.data || [], headers: props.headers, key: "list", repositoryKey: props.repositoryKey }),
      ],
    }),
  });
}

function GitRepositoryActivityPageInner(props: GitBrowserPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const activity = useGitActivity(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.activity || null,
  });

  return h(GitRepositoryShell, {
    className: props.className,
    error: activity.error,
    loading: overview.loading || activity.loading,
    page: "activity",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("section", {
      className: "git-browser-card",
      children: [
        h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Activity Timeline" }) }),
        h(GitActivityList, { activity: activity.data || [], key: "body" }),
      ],
    }),
  });
}

function GitRepositoryActionsPageInner(props: GitRepositoryActionsPageProps) {
  const client = useGitApiClient();
  const routes = useGitRepositoryRouteAdapter();
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const [search, setSearch] = useState(text(props.query));
  const [status, setStatus] = useState(text(props.status));
  const [triggerKind, setTriggerKind] = useState(text(props.triggerKind));
  const [workflowId, setWorkflowId] = useState(text(props.workflowId));
  const [branch, setBranch] = useState(text(props.branch));
  const [manualRef, setManualRef] = useState(text(props.refName, "HEAD"));
  const [workflowName, setWorkflowName] = useState("");
  const [workflowTrigger, setWorkflowTrigger] = useState<GitForgeWorkflow["trigger"]>("push");
  const [workflowBranches, setWorkflowBranches] = useState("");
  const [workflowSteps, setWorkflowSteps] = useState("bun install\nbun test");
  const deferredSearch = useDeferredValue(search);
  const workflows = useGitWorkflows(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.workflows || null,
    query: deferredSearch || undefined,
  });
  const runs = useGitWorkflowRuns(props.repositoryKey, {
    branch: text(branch),
    headers: props.headers,
    initialData: props.initialData?.workflowRuns || null,
    query: deferredSearch || undefined,
    status: status ? [status as GitForgeWorkflowRun["status"]] : undefined,
    triggerKind: triggerKind ? [triggerKind as GitForgeWorkflowRun["trigger_kind"]] : undefined,
    workflowId: text(workflowId),
  });
  const createWorkflow = useGitCreateWorkflow(props.repositoryKey, { headers: props.headers });
  const runWorkflow = useGitRunWorkflow(props.repositoryKey, { headers: props.headers });

  async function handleCreateWorkflow(event: Event) {
    event.preventDefault();
    const steps = parseWorkflowStepsInput(workflowSteps);
    if (!text(workflowName) || !steps.length) return;
    await createWorkflow.mutate({
      enabled: true,
      name: workflowName,
      source: {
        branches: parseCsvList(workflowBranches),
      },
      steps,
      trigger: workflowTrigger,
    });
    setWorkflowName("");
    setWorkflowBranches("");
    setWorkflowSteps("bun install\nbun test");
    workflows.reload();
  }

  async function handleToggleWorkflow(nextWorkflow: GitForgeWorkflow) {
    await client.updateWorkflow(props.repositoryKey, nextWorkflow.id, {
      enabled: !nextWorkflow.enabled,
      headers: props.headers,
    });
    workflows.reload();
  }

  async function handleRunWorkflow(workflow: GitForgeWorkflow) {
    const createdRun = await runWorkflow.mutate({
      ref: text(manualRef, "HEAD"),
      workflowId: workflow.id,
    });
    runs.reload();
    props.navigate?.(routes.actionRun(props.repositoryKey, createdRun.id));
  }

  const workflowEntries = workflows.data || [];
  const runEntries = runs.data || [];

  return h(GitRepositoryShell, {
    actions: defaultActionBar(props.repositoryKey, props.headers),
    className: props.className,
    error: workflows.error || runs.error,
    loading: overview.loading || workflows.loading || runs.loading,
    page: "actions",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: "Repository automation workflows, manual runs, and execution history.",
    children: h("div", {
      className: "git-browser-grid",
      children: [
        props.policy?.canConfigureActions === false
          ? null
          : h("section", {
            className: "git-browser-card",
            key: "workflow-create",
            children: [
              h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Create Workflow" }) }),
              h("form", {
                className: "git-browser-form",
                key: "form",
                onSubmit: handleCreateWorkflow,
                children: [
                  h("input", {
                    className: "git-browser-input",
                    key: "name",
                    onChange: (nextEvent: any) => setWorkflowName(text(nextEvent.target?.value)),
                    placeholder: "Workflow name",
                    value: workflowName,
                  }),
                  h("select", {
                    className: "git-browser-input",
                    key: "trigger",
                    onChange: (nextEvent: any) => setWorkflowTrigger(text(nextEvent.target?.value, "push") as GitForgeWorkflow["trigger"]),
                    value: workflowTrigger,
                    children: [
                      h("option", { key: "push", value: "push", children: "push" }),
                      h("option", { key: "release-create", value: "release.create", children: "release.create" }),
                      h("option", { key: "release-update", value: "release.update", children: "release.update" }),
                      h("option", { key: "manual", value: "manual", children: "manual" }),
                    ],
                  }),
                  h("input", {
                    className: "git-browser-input",
                    key: "branches",
                    onChange: (nextEvent: any) => setWorkflowBranches(text(nextEvent.target?.value)),
                    placeholder: "Branches, comma-separated (optional)",
                    value: workflowBranches,
                  }),
                  h("textarea", {
                    className: "git-browser-textarea",
                    key: "steps",
                    onChange: (nextEvent: any) => setWorkflowSteps(text(nextEvent.target?.value)),
                    placeholder: "One shell command per line",
                    rows: 6,
                    value: workflowSteps,
                  }),
                  h("button", {
                    className: "git-browser-action-button",
                    disabled: createWorkflow.loading,
                    key: "submit",
                    type: "submit",
                    children: createWorkflow.loading ? "Creating…" : "Create Workflow",
                  }),
                ],
              }),
            ],
          }),
        h("section", {
          className: joinClassNames("git-browser-card", props.policy?.canConfigureActions === false ? "git-browser-span-2" : "git-browser-span-2"),
          key: "workflows",
          children: [
            h("div", {
              className: "git-browser-card-header",
              key: "header",
              children: [
                h("h2", { className: "git-browser-card-title", key: "title", children: "Workflows" }),
                h("input", {
                  className: "git-browser-input",
                  key: "search",
                  onChange: (nextEvent: any) => setSearch(text(nextEvent.target?.value)),
                  placeholder: "Search workflows and runs",
                  value: search,
                }),
              ],
            }),
            h("p", { className: "git-browser-note", key: "manual-ref", children: "Manual run ref" }),
            h("input", {
              className: "git-browser-input",
              key: "ref",
              onChange: (nextEvent: any) => setManualRef(text(nextEvent.target?.value, "HEAD")),
              placeholder: "HEAD",
              value: manualRef,
            }),
            workflowEntries.length
              ? h("ul", {
                className: "git-browser-list",
                key: "list",
                children: workflowEntries.map((workflow) => h("li", {
                  className: "git-browser-list-item",
                  key: workflow.id,
                  children: [
                    h("div", { className: "git-browser-card-header", key: `${workflow.id}:header`, children: h("h3", { className: "git-browser-card-title", children: workflow.name }) }),
                    h("p", { className: "git-browser-note", key: `${workflow.id}:meta`, children: `${workflow.trigger} · ${workflow.enabled ? "enabled" : "disabled"} · ${describeWorkflowScope(workflow)}` }),
                    h("pre", { className: "git-browser-code-block", key: `${workflow.id}:steps`, children: workflow.steps.map((step) => step.run).join("\n") }),
                    h(GitRepositoryActionBar, {
                      key: `${workflow.id}:actions`,
                      children: [
                        props.policy?.canRunActions === false
                          ? null
                          : h("button", {
                            className: "git-browser-action-button",
                            key: "run",
                            onClick: () => {
                              void handleRunWorkflow(workflow);
                            },
                            type: "button",
                            children: "Run Now",
                          }),
                        props.policy?.canConfigureActions === false
                          ? null
                          : h("button", {
                            className: "git-browser-action-button",
                            key: "toggle",
                            onClick: () => {
                              void handleToggleWorkflow(workflow);
                            },
                            type: "button",
                            children: workflow.enabled ? "Disable" : "Enable",
                          }),
                      ],
                    }),
                  ],
                })),
              })
              : h("p", { className: "git-browser-note", key: "empty", children: "No workflows configured yet." }),
          ],
        }),
        h("section", {
          className: "git-browser-card git-browser-span-3",
          key: "runs",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Workflow Runs" }) }),
            h("div", {
              className: "git-browser-grid",
              key: "filters",
              children: [
                h("select", {
                  className: "git-browser-input",
                  key: "status",
                  onChange: (nextEvent: any) => setStatus(text(nextEvent.target?.value)),
                  value: status,
                  children: [
                    h("option", { key: "all", value: "", children: "All statuses" }),
                    ...["queued", "starting", "running", "success", "failed", "cancelled", "skipped"].map((entry) => h("option", {
                      key: entry,
                      value: entry,
                      children: entry,
                    })),
                  ],
                }),
                h("select", {
                  className: "git-browser-input",
                  key: "trigger",
                  onChange: (nextEvent: any) => setTriggerKind(text(nextEvent.target?.value)),
                  value: triggerKind,
                  children: [
                    h("option", { key: "all", value: "", children: "All triggers" }),
                    ...["manual", "push", "release.create", "release.update"].map((entry) => h("option", {
                      key: entry,
                      value: entry,
                      children: entry,
                    })),
                  ],
                }),
                h("select", {
                  className: "git-browser-input",
                  key: "workflow",
                  onChange: (nextEvent: any) => setWorkflowId(text(nextEvent.target?.value)),
                  value: workflowId,
                  children: [
                    h("option", { key: "all", value: "", children: "All workflows" }),
                    ...workflowEntries.map((workflow) => h("option", {
                      key: workflow.id,
                      value: workflow.id,
                      children: workflow.name,
                    })),
                  ],
                }),
                h("input", {
                  className: "git-browser-input",
                  key: "branch",
                  onChange: (nextEvent: any) => setBranch(text(nextEvent.target?.value)),
                  placeholder: "Filter by branch",
                  value: branch,
                }),
              ],
            }),
            runEntries.length
              ? h("ul", {
                className: "git-browser-list",
                key: "list",
                children: runEntries.map((run) => h("li", {
                  className: "git-browser-list-item",
                  key: run.id,
                  children: h("button", {
                    className: "git-browser-list-link",
                    onClick: () => props.navigate?.(routes.actionRun(props.repositoryKey, run.id)),
                    type: "button",
                    children: `${run.status} · ${run.trigger_kind} · ${text(run.branch, run.ref)} · ${run.summary}`,
                  }),
                })),
              })
              : h("p", { className: "git-browser-note", key: "empty", children: "No workflow runs match these filters." }),
          ],
        }),
      ],
    }),
  });
}

function GitRepositoryActionRunPageInner(props: GitRepositoryActionRunPageProps) {
  const client = useGitApiClient();
  const routes = useGitRepositoryRouteAdapter();
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const run = useGitWorkflowRun(props.repositoryKey, props.runId, {
    headers: props.headers,
    initialData: props.initialData?.workflowRun || null,
  });
  const workflow = useGitWorkflow(props.repositoryKey, run.data?.workflow_id || "", {
    enabled: Boolean(run.data?.workflow_id),
    headers: props.headers,
    initialData: props.initialData?.workflow || null,
  });
  const steps = useGitWorkflowRunSteps(props.repositoryKey, props.runId, {
    headers: props.headers,
    initialData: props.initialData?.workflowRunSteps || null,
  });
  const persistedEvents = useGitWorkflowRunEvents(props.repositoryKey, props.runId, {
    headers: props.headers,
    initialData: props.initialData?.workflowRunEvents || null,
  });
  const cancelRun = useGitCancelWorkflowRun(props.repositoryKey, props.runId, { headers: props.headers });
  const [events, setEvents] = useState<GitForgeWorkflowRunEvent[]>(props.initialData?.workflowRunEvents || []);
  const [socketState, setSocketState] = useState<"completed" | "connected" | "connecting" | "disconnected">("disconnected");
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    if (!(persistedEvents.data || []).length) return;
    setEvents((current) => (persistedEvents.data || []).reduce(appendWorkflowEvent, current));
  }, [persistedEvents.data]);

  useEffect(() => {
    const currentRun = run.data;
    if (!currentRun) return;
    if (["cancelled", "failed", "skipped", "success"].includes(currentRun.status)) {
      setSocketState("completed");
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    setSocketState("connecting");
    const stream = client.openWorkflowRunSocket(props.repositoryKey, props.runId, {
      afterSequence: events[events.length - 1]?.sequence,
      headers: props.headers,
      onDone() {
        if (disposed) return;
        setSocketState("completed");
        run.reload();
        steps.reload();
      },
      onError() {
        if (disposed) return;
        setSocketState("disconnected");
        reconnectTimer = setTimeout(() => {
          setReconnectNonce((value) => value + 1);
        }, 500);
      },
      onEvent(nextEvent) {
        if ("sequence" in nextEvent) {
          setSocketState("connected");
          setEvents((current) => appendWorkflowEvent(current, nextEvent));
          if (nextEvent.type === "run.cancelled" || nextEvent.type === "run.failed" || nextEvent.type === "run.finished") {
            run.reload();
            steps.reload();
          }
        }
      },
    });

    void stream.completed.catch(() => {});

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stream.close();
    };
  }, [client, props.headers, props.repositoryKey, props.runId, reconnectNonce, run.data?.status]);

  const runData = run.data;
  const terminal = ["cancelled", "failed", "skipped", "success"].includes(text(runData?.status));

  return h(GitRepositoryShell, {
    actions: h(GitRepositoryActionBar, {
      children: [
        h("button", {
          className: "git-browser-action-button",
          key: "back",
          onClick: () => props.navigate?.(routes.actions(props.repositoryKey)),
          type: "button",
          children: "Back to Actions",
        }),
        props.policy?.canCancelActions === false || !runData || terminal
          ? null
          : h("button", {
            className: "git-browser-action-button",
            disabled: cancelRun.loading,
            key: "cancel",
            onClick: async () => {
              await cancelRun.mutate();
              run.reload();
              steps.reload();
            },
            type: "button",
            children: cancelRun.loading ? "Cancelling…" : "Cancel Run",
          }),
      ],
    }),
    className: props.className,
    error: run.error || workflow.error || steps.error || persistedEvents.error,
    loading: overview.loading || run.loading || workflow.loading || steps.loading || persistedEvents.loading,
    page: "actions",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: runData ? `${runData.status} · ${runData.trigger_kind} · ${text(runData.branch, runData.ref)}` : "Workflow run details",
    title: workflow.data?.name || "Workflow Run",
    children: runData ? h("div", {
      className: "git-browser-grid",
      children: [
        h("section", {
          className: "git-browser-card",
          key: "summary",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Run Summary" }) }),
            h("dl", {
              className: "git-browser-definition-grid",
              key: "meta",
              children: [
                h("dt", { key: "status:label", children: "Status" }),
                h("dd", { key: "status:value", children: runData.status }),
                h("dt", { key: "workflow:label", children: "Workflow" }),
                h("dd", { key: "workflow:value", children: workflow.data?.name || runData.workflow_id }),
                h("dt", { key: "trigger:label", children: "Trigger" }),
                h("dd", { key: "trigger:value", children: runData.trigger_kind }),
                h("dt", { key: "ref:label", children: "Ref" }),
                h("dd", { key: "ref:value", children: runData.ref }),
                h("dt", { key: "branch:label", children: "Branch" }),
                h("dd", { key: "branch:value", children: text(runData.branch, "n/a") }),
                h("dt", { key: "commit:label", children: "Commit" }),
                h("dd", { key: "commit:value", children: runData.commit_hash }),
                h("dt", { key: "actor:label", children: "Actor" }),
                h("dd", { key: "actor:value", children: runData.created_by }),
                h("dt", { key: "runner:label", children: "Runner" }),
                h("dd", { key: "runner:value", children: runData.runner ? `${runData.runner.kind} @ ${runData.runner.host}` : "Pending assignment" }),
                h("dt", { key: "started:label", children: "Started" }),
                h("dd", { key: "started:value", children: formatDateTime(runData.started_at || runData.created_at) }),
                h("dt", { key: "finished:label", children: "Finished" }),
                h("dd", { key: "finished:value", children: formatDateTime(runData.finished_at) }),
                h("dt", { key: "duration:label", children: "Duration" }),
                h("dd", { key: "duration:value", children: formatDuration(runData.started_at || runData.created_at, runData.finished_at) }),
                h("dt", { key: "live:label", children: "Live stream" }),
                h("dd", { key: "live:value", children: terminal ? "completed" : socketState }),
              ],
            }),
            h("p", { className: "git-browser-note", key: "current-step", children: `Current step: ${text(runData.current_step, "Waiting")}` }),
          ],
        }),
        h("section", {
          className: "git-browser-card git-browser-span-2",
          key: "steps",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Steps" }) }),
            (steps.data || []).length
              ? h("ul", {
                className: "git-browser-list",
                key: "list",
                children: (steps.data || []).map((step: GitForgeWorkflowRunStep) => h("li", {
                  className: "git-browser-list-item",
                  key: step.id,
                  children: [
                    h("div", { className: "git-browser-card-header", key: `${step.id}:header`, children: h("h3", { className: "git-browser-card-title", children: `${step.index + 1}. ${step.name}` }) }),
                    h("p", { className: "git-browser-note", key: `${step.id}:meta`, children: `${step.status} · exit ${step.exit_code == null ? "n/a" : step.exit_code} · ${formatDuration(step.started_at, step.finished_at)}` }),
                    h("pre", { className: "git-browser-code-block", key: `${step.id}:command`, children: step.command }),
                    step.output_preview
                      ? h("pre", { className: "git-browser-code-block", key: `${step.id}:preview`, children: step.output_preview })
                      : null,
                  ],
                })),
              })
              : h("p", { className: "git-browser-note", key: "empty", children: "Step records will appear when the run is expanded." }),
          ],
        }),
        h("section", {
          className: "git-browser-card git-browser-span-3",
          key: "logs",
          children: [
            h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Live Logs" }) }),
            h("p", { className: "git-browser-note", key: "socket", children: `Socket ${socketState}${terminal ? " · run completed" : ""}` }),
            h("pre", {
              className: "git-browser-code-block",
              key: "stream",
              children: events.length
                ? events.map((event) => renderWorkflowEventLine(event)).join("\n")
                : "No persisted output yet.",
            }),
          ],
        }),
      ],
    }) : null,
  });
}

function GitRepositoryBranchesPageInner(props: GitBrowserPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const branches = useGitBranches(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.branches || null,
  });

  return h(GitRepositoryShell, {
    actions: h(GitRepositoryActionBar, {
      children: h(GitBranchSelector, { headers: props.headers, repositoryKey: props.repositoryKey, selectedBranch: overview.data?.repository.repository.current_branch }),
    }),
    className: props.className,
    error: branches.error,
    loading: overview.loading || branches.loading,
    page: "branches",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("section", {
      className: "git-browser-card",
      children: [
        h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Branches" }) }),
        h(GitBranchList, { branches: branches.data || [], key: "list", repositoryKey: props.repositoryKey }),
      ],
    }),
  });
}

function GitRepositoryTagsPageInner(props: GitBrowserPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const tags = useGitTags(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.tags || null,
  });

  return h(GitRepositoryShell, {
    actions: h(GitRepositoryActionBar, {
      children: h(GitTagSelector, { headers: props.headers, repositoryKey: props.repositoryKey }),
    }),
    className: props.className,
    error: tags.error,
    loading: overview.loading || tags.loading,
    page: "tags",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("section", {
      className: "git-browser-card",
      children: [
        h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Tags" }) }),
        h(GitTagList, { key: "list", repositoryKey: props.repositoryKey, tags: tags.data || [] }),
      ],
    }),
  });
}

function GitRepositorySearchPageInner(props: GitRepositorySearchPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const [query, setQuery] = useState(text(props.query));
  const results = useGitSearch(props.repositoryKey, {
    enabled: Boolean(query),
    headers: props.headers,
    initialData: props.initialData?.search || null,
    path: props.path,
    query,
    ref: props.refName || overview.data?.repository.repository.current_branch || "HEAD",
  });

  return h(GitRepositoryShell, {
    className: props.className,
    error: results.error,
    loading: overview.loading || results.loading,
    page: "search",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: defaultSubtitle(props.repositoryKey, overview.data),
    children: h("section", {
      className: "git-browser-card",
      children: [
        h("div", {
          className: "git-browser-card-header",
          key: "header",
          children: [
            h("h2", { className: "git-browser-card-title", key: "title", children: "Search" }),
            h("input", {
              className: "git-browser-input",
              key: "input",
              onChange: (event: any) => setQuery(text(event.target?.value)),
              placeholder: "Search this repository",
              value: query,
            }),
          ],
        }),
        h(GitSearchResults, { key: "results", repositoryKey: props.repositoryKey, results: results.data }),
      ],
    }),
  });
}

function GitRepositoryBlamePageInner(props: GitRepositoryBlamePageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const blame = useGitBlame(props.repositoryKey, {
    headers: props.headers,
    path: props.path,
    ref: props.refName || overview.data?.repository.repository.current_branch || "HEAD",
  });

  return h(GitRepositoryShell, {
    className: props.className,
    error: blame.error,
    loading: overview.loading || blame.loading,
    page: "blame",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: props.path ? `Blame for ${props.path}` : defaultSubtitle(props.repositoryKey, overview.data),
    children: h("section", {
      className: "git-browser-card",
      children: [
        h("div", { className: "git-browser-card-header", key: "header", children: h("h2", { className: "git-browser-card-title", children: "Blame" }) }),
        h(GitBlameView, { blame: blame.data, key: "view", refName: props.refName, repositoryKey: props.repositoryKey }),
      ],
    }),
  });
}

function GitRepositoryComparePageInner(props: GitRepositoryComparePageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData?.overview || null,
  });
  const diff = useGitDiff(props.repositoryKey, {
    baseRef: props.baseRef,
    headRef: props.headRef,
    headers: props.headers,
    initialData: props.initialData?.compare || null,
    path: props.path,
  });

  return h(GitRepositoryShell, {
    className: props.className,
    error: diff.error,
    loading: overview.loading || diff.loading,
    page: "compare",
    repositoryKey: props.repositoryKey,
    social: overview.data?.social,
    stats: overviewStats(overview.data),
    subtitle: `${props.baseRef} → ${props.headRef}`,
    children: h(GitDiffView, { diff: diff.data }),
  });
}

function GitRepositoryOverviewPage(props: GitBrowserPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryOverviewPageInner, props));
}

function GitRepositoryCodePage(props: GitRepositoryCodePageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryCodePageInner, props));
}

function GitRepositoryCommitsPage(props: GitRepositoryCommitsPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryCommitsPageInner, props));
}

function GitRepositoryCommitPage(props: GitRepositoryCommitPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryCommitPageInner, props));
}

function GitRepositoryReleasesPage(props: GitBrowserPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryReleasesPageInner, props));
}

function GitRepositoryReleasePage(props: GitRepositoryReleasePageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryReleasePageInner, props));
}

function GitRepositoryForksPage(props: GitBrowserPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryForksPageInner, props));
}

function GitRepositoryActivityPage(props: GitBrowserPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryActivityPageInner, props));
}

function GitRepositoryActionsPage(props: GitRepositoryActionsPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryActionsPageInner, props));
}

function GitRepositoryActionRunPage(props: GitRepositoryActionRunPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryActionRunPageInner, props));
}

function GitRepositoryBranchesPage(props: GitBrowserPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryBranchesPageInner, props));
}

function GitRepositoryTagsPage(props: GitBrowserPageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryTagsPageInner, props));
}

function GitRepositorySearchPage(props: GitRepositorySearchPageProps) {
  return withBrowserProvider(props, () => h(GitRepositorySearchPageInner, props));
}

function GitRepositoryBlamePage(props: GitRepositoryBlamePageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryBlamePageInner, props));
}

function GitRepositoryComparePage(props: GitRepositoryComparePageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryComparePageInner, props));
}

export {
  GitBrowserProvider,
  GitRepositoryActivityPage,
  GitRepositoryActionsPage,
  GitRepositoryActionRunPage,
  GitRepositoryBlamePage,
  GitRepositoryBranchesPage,
  GitRepositoryCodePage,
  GitRepositoryCommitPage,
  GitRepositoryCommitsPage,
  GitRepositoryComparePage,
  GitRepositoryForksPage,
  GitRepositoryOverviewPage,
  GitRepositoryReleasePage,
  GitRepositoryReleasesPage,
  GitRepositorySearchPage,
  GitRepositoryTagsPage,
};

export type {
  GitBrowserPageProps,
  GitBrowserProviderProps,
  GitRepositoryActionRunPageProps,
  GitRepositoryActionsPageProps,
  GitRepositoryBlamePageProps,
  GitRepositoryCodePageProps,
  GitRepositoryCommitPageProps,
  GitRepositoryCommitsPageProps,
  GitRepositoryComparePageProps,
  GitRepositoryReleasePageProps,
  GitRepositoryRouteAdapter,
  GitRepositorySearchPageProps,
};
