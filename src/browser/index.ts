import {
  createElement,
  useDeferredValue,
  useState,
  type ReactNode,
} from "react";

import { createGitApiClient } from "../react/client.js";
import type { GitApiClient, GitApiClientHeaders } from "../react/client.js";
import {
  GitActivityList,
  GitApiClientProvider,
  GitBlameView,
  GitBlobView,
  GitBranchList,
  GitBranchSelector,
  GitCommitList,
  GitCopyCloneUrlButton,
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
  useGitDiff,
  useGitForks,
  useGitCreateRelease,
  useGitOverview,
  useGitRelease,
  useGitReleases,
  useGitSearch,
  useGitTags,
  useGitTree,
  useGitUpdateRelease,
  type GitRepositoryUiProviderProps,
  type GitRepositoryUiTheme,
} from "../react/index.js";
import type { GitRepositoryFrontEndInitialData, GitRepositoryRouteAdapter } from "../react/ui/context.js";
import type { GitForgeRelease, GitForgeRepositoryOverview } from "../types.js";
import { text } from "../utils/text.js";

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

function joinClassNames(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
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
                  children: `${asset.name}${asset.size ? ` · ${asset.size} bytes` : ""}`,
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
  GitRepositoryBlamePageProps,
  GitRepositoryCodePageProps,
  GitRepositoryCommitPageProps,
  GitRepositoryCommitsPageProps,
  GitRepositoryComparePageProps,
  GitRepositoryReleasePageProps,
  GitRepositoryRouteAdapter,
  GitRepositorySearchPageProps,
};
