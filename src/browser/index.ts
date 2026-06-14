import {
  createElement,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createGitApiClient } from "../react/client.js";
import type { GitApiClient, GitApiClientHeaders } from "../react/client.js";
import {
  GitApiClientProvider,
  applyGitStarOptimisticState,
  applyGitWatchOptimisticState,
  useGitActivity,
  useGitBlob,
  useGitCommit,
  useGitCommits,
  useGitCreateFork,
  useGitCreateRelease,
  useGitForks,
  useGitOverview,
  useGitRelease,
  useGitReleases,
  useGitSocialState,
  useGitStarRepository,
  useGitSyncFork,
  useGitTree,
  useGitUnstarRepository,
  useGitUnwatchRepository,
  useGitWatchRepository,
} from "../react/index.js";
import type {
  GitForgeFork,
  GitForgeRelease,
  GitForgeRepositoryOverview,
  GitForgeSocialState,
  GitTreeEntry,
} from "../types.js";
import { text } from "../utils/text.js";

const h = createElement;

type GitBrowserProviderProps = {
  baseUrl?: string;
  children?: ReactNode;
  client?: GitApiClient;
  headers?: GitApiClientHeaders;
};

type GitBrowserPageProps<TData = unknown> = {
  baseUrl?: string;
  className?: string;
  client?: GitApiClient;
  headers?: GitApiClientHeaders;
  initialData?: TData | null;
  navigate?: (to: string) => void;
  repositoryKey: string;
};

type GitRepositoryCodePageProps = GitBrowserPageProps<GitForgeRepositoryOverview> & {
  path?: string;
  refName?: string;
};

type GitRepositoryCommitsPageProps = GitBrowserPageProps<GitForgeRepositoryOverview> & {
  path?: string;
  refName?: string;
};

type GitRepositoryCommitPageProps = GitBrowserPageProps<GitForgeRepositoryOverview> & {
  commitRef: string;
};

type GitRepositoryReleasePageProps = GitBrowserPageProps<GitForgeRepositoryOverview> & {
  releaseId: string;
};

function joinClassNames(...values: Array<string | undefined | null | false>) {
  return values.filter(Boolean).join(" ");
}

function GitBrowserProvider(props: GitBrowserProviderProps) {
  const [client] = useState(() => props.client || createGitApiClient({
    baseUrl: text(props.baseUrl),
    headers: props.headers,
  }));
  return h(GitApiClientProvider, {
    client,
    children: props.children,
  });
}

function withBrowserProvider<TData>(
  props: GitBrowserPageProps<TData>,
  render: () => ReactNode,
) {
  if (!props.client && !props.baseUrl) return render();
  return h(GitBrowserProvider, {
    baseUrl: props.baseUrl,
    client: props.client,
    headers: props.headers,
    children: render(),
  });
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

function LinkButton(props: {
  active?: boolean;
  children?: ReactNode;
  navigate?: (to: string) => void;
  to: string;
}) {
  return h("button", {
    className: joinClassNames("git-browser-nav-link", props.active && "is-active"),
    onClick: () => props.navigate && props.navigate(props.to),
    type: "button",
    children: props.children,
  });
}

function StatusBlock(props: { error: Error | null; loading: boolean; children?: ReactNode }) {
  if (props.loading) return h("div", { className: "git-browser-status", children: "Loading repository data..." });
  if (props.error) return h("div", { className: "git-browser-status is-error", children: props.error.message });
  return h("div", { children: props.children });
}

function RepositoryNav(props: { navigate?: (to: string) => void; repositoryKey: string; current: string }) {
  return h("div", {
    className: "git-browser-nav",
    children: [
      h(LinkButton, { active: props.current === "overview", key: "overview", navigate: props.navigate, to: `/repositories/${props.repositoryKey}/overview`, children: "Overview" }),
      h(LinkButton, { active: props.current === "code", key: "code", navigate: props.navigate, to: `/repositories/${props.repositoryKey}/code`, children: "Code" }),
      h(LinkButton, { active: props.current === "commits", key: "commits", navigate: props.navigate, to: `/repositories/${props.repositoryKey}/commits`, children: "Commits" }),
      h(LinkButton, { active: props.current === "releases", key: "releases", navigate: props.navigate, to: `/repositories/${props.repositoryKey}/releases`, children: "Releases" }),
      h(LinkButton, { active: props.current === "forks", key: "forks", navigate: props.navigate, to: `/repositories/${props.repositoryKey}/forks`, children: "Forks" }),
      h(LinkButton, { active: props.current === "activity", key: "activity", navigate: props.navigate, to: `/repositories/${props.repositoryKey}/activity`, children: "Activity" }),
    ],
  });
}

function SocialControls(props: {
  headers?: GitApiClientHeaders;
  repositoryKey: string;
  social: GitForgeSocialState | null;
}) {
  const [optimistic, setOptimistic] = useState<GitForgeSocialState | null>(props.social);
  useEffect(() => {
    setOptimistic(props.social);
  }, [props.social]);
  const star = useGitStarRepository(props.repositoryKey, { headers: props.headers });
  const unstar = useGitUnstarRepository(props.repositoryKey, { headers: props.headers });
  const watch = useGitWatchRepository(props.repositoryKey, { headers: props.headers });
  const unwatch = useGitUnwatchRepository(props.repositoryKey, { headers: props.headers });
  const social = optimistic;

  return h("div", {
    className: "git-browser-actions",
    children: [
      h("button", {
        className: joinClassNames("git-browser-action-button", social?.viewer_has_starred && "is-active"),
        disabled: star.loading || unstar.loading,
        key: "star",
        onClick: async () => {
          const next = social?.viewer_has_starred !== true;
          setOptimistic(applyGitStarOptimisticState(social, next));
          try {
            setOptimistic(next ? await star.mutate() : await unstar.mutate());
          } catch {
            setOptimistic(props.social);
          }
        },
        type: "button",
        children: `${social?.viewer_has_starred ? "Starred" : "Star"} ${social?.star_count ?? 0}`,
      }),
      h("button", {
        className: joinClassNames("git-browser-action-button", social?.viewer_is_watching && "is-active"),
        disabled: watch.loading || unwatch.loading,
        key: "watch",
        onClick: async () => {
          const next = social?.viewer_is_watching !== true;
          setOptimistic(applyGitWatchOptimisticState(social, next));
          try {
            setOptimistic(next ? await watch.mutate() : await unwatch.mutate());
          } catch {
            setOptimistic(props.social);
          }
        },
        type: "button",
        children: `${social?.viewer_is_watching ? "Watching" : "Watch"} ${social?.watcher_count ?? 0}`,
      }),
    ],
  });
}

function RepositoryHeader(props: {
  current: string;
  headers?: GitApiClientHeaders;
  navigate?: (to: string) => void;
  overview: GitForgeRepositoryOverview | null;
  repositoryKey: string;
}) {
  const socialQuery = useGitSocialState(props.repositoryKey, {
    headers: props.headers,
    initialData: props.overview?.social || null,
  });
  const createFork = useGitCreateFork(props.repositoryKey, { headers: props.headers });

  return h("section", {
    className: "git-browser-hero",
    children: [
      h("div", {
        className: "git-browser-hero-top",
        key: "title",
        children: [
          h("div", {
            className: "git-browser-title-block",
            key: "block",
            children: [
              h("div", { className: "git-browser-badge", key: "badge", children: "Embeddable Forge" }),
              h("h1", { className: "git-browser-title", key: "title", children: props.repositoryKey }),
              h("p", {
                className: "git-browser-subtitle",
                key: "subtitle",
                children: props.overview
                  ? `${props.overview.repository.repository.current_branch} branch, ${props.overview.release_count} releases, ${props.overview.fork_count} forks`
                  : "Repository browser",
              }),
            ],
          }),
          h("div", {
            className: "git-browser-header-actions",
            key: "actions",
            children: [
              h(SocialControls, {
                headers: props.headers,
                key: "social",
                repositoryKey: props.repositoryKey,
                social: socialQuery.data,
              }),
              h("button", {
                className: "git-browser-action-button is-primary",
                disabled: createFork.loading,
                key: "fork",
                onClick: async () => {
                  await createFork.mutate();
                },
                type: "button",
                children: createFork.loading ? "Forking..." : "Create Fork",
              }),
            ],
          }),
        ],
      }),
      h(RepositoryNav, {
        current: props.current,
        navigate: props.navigate,
        repositoryKey: props.repositoryKey,
        key: "nav",
      }),
    ],
  });
}

function Card(props: { title: string; subtitle?: string; children?: ReactNode; className?: string }) {
  return h("section", {
    className: joinClassNames("git-browser-card", props.className),
    children: [
      h("div", {
        className: "git-browser-card-header",
        key: "header",
        children: [
          h("h2", { className: "git-browser-card-title", key: "title", children: props.title }),
          props.subtitle ? h("div", { className: "git-browser-card-subtitle", key: "subtitle", children: props.subtitle }) : null,
        ],
      }),
      h("div", {
        className: "git-browser-card-body",
        key: "body",
        children: props.children,
      }),
    ],
  });
}

function DefinitionGrid(props: { rows: Array<{ label: string; value: ReactNode }> }) {
  return h("dl", {
    className: "git-browser-definition-grid",
    children: props.rows.flatMap((row) => ([
      h("dt", { key: `${row.label}:label`, children: row.label }),
      h("dd", { key: `${row.label}:value`, children: row.value }),
    ])),
  });
}

function findReadme(entries: GitTreeEntry[]): string {
  const match = entries.find((entry) => entry.type === "blob" && /^readme(\.|$)/i.test(entry.name));
  return match ? match.path : "";
}

function GitRepositoryOverviewPageInner(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const tree = useGitTree(props.repositoryKey, {
    headers: props.headers,
    icons: true,
    path: "",
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

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "overview",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: overview.error,
        key: "status",
        loading: overview.loading,
        children: overview.data ? h("div", {
          className: "git-browser-grid",
          children: [
            h(Card, {
              className: "git-browser-span-2",
              key: "summary",
              title: "Repository Summary",
              subtitle: overview.data.repository.repository.path,
              children: h(DefinitionGrid, {
                rows: [
                  { label: "Branch", value: overview.data.repository.repository.current_branch },
                  { label: "Head", value: overview.data.repository.repository.head_short },
                  { label: "Releases", value: String(overview.data.release_count) },
                  { label: "Forks", value: String(overview.data.fork_count) },
                  { label: "Activity", value: String(overview.data.activity_count) },
                ],
              }),
            }),
            h(Card, {
              key: "latest-release",
              title: "Latest Release",
              children: overview.data.latest_release
                ? [
                  h("div", { className: "git-browser-inline-meta", key: "title", children: `${overview.data.latest_release.title} · ${overview.data.latest_release.tag_name}` }),
                  h("p", { className: "git-browser-note", key: "notes", children: overview.data.latest_release.notes || "No notes yet." }),
                ]
                : "No releases published yet.",
            }),
            h(Card, {
              className: "git-browser-span-3",
              key: "readme",
              title: "README",
              children: readme.data
                ? h("pre", { className: "git-browser-code-block", children: readme.data.content })
                : "README content not available.",
            }),
          ],
        }) : null,
      }),
    ],
  });
}

function GitRepositoryCodePageInner(props: GitRepositoryCodePageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const deferredPath = useDeferredValue(text(props.path));
  const tree = useGitTree(props.repositoryKey, {
    headers: props.headers,
    icons: true,
    linguist: true,
    recursive: true,
    ref: props.refName || overview.data?.repository.repository.current_branch || "HEAD",
  });
  const selectedPath = deferredPath || (tree.data || []).find((entry) => entry.type === "blob")?.path || "";
  const selectedEntry = (tree.data || []).find((entry) => entry.path === selectedPath) || null;
  const blob = useGitBlob(props.repositoryKey, {
    enabled: Boolean(selectedEntry && selectedEntry.type === "blob"),
    headers: props.headers,
    path: selectedPath,
    ref: props.refName || overview.data?.repository.repository.current_branch || "HEAD",
  });

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "code",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: tree.error || blob.error,
        key: "status",
        loading: overview.loading || tree.loading || blob.loading,
        children: h("div", {
          className: "git-browser-split",
          children: [
            h(Card, {
              key: "tree",
              title: "Repository Tree",
              subtitle: props.refName || overview.data?.repository.repository.current_branch || "HEAD",
              children: h("ul", {
                className: "git-browser-list",
                children: (tree.data || []).map((entry) => (
                  h("li", {
                    className: joinClassNames("git-browser-list-item", entry.path === selectedPath && "is-selected"),
                    key: entry.path,
                    children: `${entry.type === "tree" ? "dir" : "file"} · ${entry.path}${entry.language ? ` · ${entry.language}` : ""}`,
                  })
                )),
              }),
            }),
            h(Card, {
              className: "git-browser-span-2",
              key: "blob",
              title: selectedPath || "File Preview",
              subtitle: selectedEntry?.language || "Plain text",
              children: blob.data
                ? h("pre", { className: "git-browser-code-block", children: blob.data.content })
                : "Select a file path to preview blob content.",
            }),
          ],
        }),
      }),
    ],
  });
}

function GitRepositoryCommitsPageInner(props: GitRepositoryCommitsPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const commits = useGitCommits(props.repositoryKey, {
    headers: props.headers,
    path: props.path,
    ref: props.refName || overview.data?.repository.repository.current_branch || "HEAD",
  });

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "commits",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: commits.error,
        key: "status",
        loading: overview.loading || commits.loading,
        children: h(Card, {
          title: "Commit History",
          subtitle: props.path ? `Filtered to ${props.path}` : "Latest repository activity",
          children: h("ul", {
            className: "git-browser-list",
            children: (commits.data || []).map((commit) => (
              h("li", {
                className: "git-browser-list-item",
                key: commit.hash,
                children: `${commit.short_hash} · ${commit.subject} · ${commit.author_name} · ${formatDate(commit.authored_at)}`,
              })
            )),
          }),
        }),
      }),
    ],
  });
}

function GitRepositoryCommitPageInner(props: GitRepositoryCommitPageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const commit = useGitCommit(props.repositoryKey, props.commitRef, {
    headers: props.headers,
  });

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "commits",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: commit.error,
        key: "status",
        loading: overview.loading || commit.loading,
        children: commit.data ? h("div", {
          className: "git-browser-grid",
          children: [
            h(Card, {
              className: "git-browser-span-3",
              key: "meta",
              title: commit.data.commit.subject,
              subtitle: `${commit.data.commit.short_hash} by ${commit.data.commit.author_name}`,
              children: h(DefinitionGrid, {
                rows: [
                  { label: "Authored", value: formatDate(commit.data.commit.authored_at) },
                  { label: "Files", value: String(commit.data.file_count) },
                  { label: "Added", value: String(commit.data.lines_added) },
                  { label: "Removed", value: String(commit.data.lines_removed) },
                ],
              }),
            }),
            h(Card, {
              className: "git-browser-span-3",
              key: "diff",
              title: "Diff",
              children: h("pre", { className: "git-browser-code-block", children: commit.data.diff }),
            }),
          ],
        }) : null,
      }),
    ],
  });
}

function ReleaseComposer(props: {
  headers?: GitApiClientHeaders;
  onCreated: (release: GitForgeRelease) => void;
  repositoryKey: string;
}) {
  const createRelease = useGitCreateRelease(props.repositoryKey, { headers: props.headers });
  const [title, setTitle] = useState("");
  const [tagName, setTagName] = useState("");
  const [notes, setNotes] = useState("");

  return h("form", {
    className: "git-browser-form",
    onSubmit: async (event: Event) => {
      event.preventDefault();
      const release = await createRelease.mutate({
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
      props.onCreated(release);
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
  });
}

function GitRepositoryReleasesPageInner(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const releases = useGitReleases(props.repositoryKey, {
    headers: props.headers,
  });
  const [createdRelease, setCreatedRelease] = useState<GitForgeRelease | null>(null);
  useEffect(() => {
    if (createdRelease) releases.reload();
  }, [createdRelease]);

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "releases",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: releases.error,
        key: "status",
        loading: overview.loading || releases.loading,
        children: h("div", {
          className: "git-browser-grid",
          children: [
            h(Card, {
              key: "composer",
              title: "Publish a Release",
              subtitle: "This creates an annotated tag when needed.",
              children: h(ReleaseComposer, {
                headers: props.headers,
                onCreated: setCreatedRelease,
                repositoryKey: props.repositoryKey,
              }),
            }),
            h(Card, {
              className: "git-browser-span-2",
              key: "list",
              title: "Releases",
              children: h("ul", {
                className: "git-browser-list",
                children: (releases.data || []).map((release) => (
                  h("li", {
                    className: "git-browser-list-item",
                    key: release.id,
                    children: [
                      h("strong", { key: "title", children: `${release.title} · ${release.tag_name}` }),
                      h("div", { className: "git-browser-note", key: "meta", children: `${release.prerelease ? "Prerelease" : "Stable"} · ${formatDate(release.published_at || release.created_at)}` }),
                      h("p", { className: "git-browser-note", key: "notes", children: release.notes || "No release notes." }),
                    ],
                  })
                )),
              }),
            }),
          ],
        }),
      }),
    ],
  });
}

function GitRepositoryReleasePageInner(props: GitRepositoryReleasePageProps) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const release = useGitRelease(props.repositoryKey, props.releaseId, {
    headers: props.headers,
  });

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "releases",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: release.error,
        key: "status",
        loading: overview.loading || release.loading,
        children: release.data ? h("div", {
          className: "git-browser-grid",
          children: [
            h(Card, {
              className: "git-browser-span-2",
              key: "details",
              title: release.data.title,
              subtitle: `${release.data.tag_name} · ${release.data.prerelease ? "Prerelease" : "Release"}`,
              children: [
                h("p", { className: "git-browser-note", key: "notes", children: release.data.notes || "No release notes." }),
                h(DefinitionGrid, {
                  key: "meta",
                  rows: [
                    { label: "Published", value: formatDate(release.data.published_at || release.data.created_at) },
                    { label: "Target", value: release.data.target_ref },
                    { label: "Assets", value: String(release.data.assets.length) },
                  ],
                }),
              ],
            }),
            h(Card, {
              key: "assets",
              title: "Assets",
              children: release.data.assets.length
                ? h("ul", {
                  className: "git-browser-list",
                  children: release.data.assets.map((asset) => (
                    h("li", {
                      className: "git-browser-list-item",
                      key: asset.id,
                      children: `${asset.name}${asset.size ? ` · ${asset.size} bytes` : ""}`,
                    })
                  )),
                })
                : "No assets attached.",
            }),
          ],
        }) : null,
      }),
    ],
  });
}

function ForkRow(props: { fork: GitForgeFork; headers?: GitApiClientHeaders; repositoryKey: string }) {
  const syncFork = useGitSyncFork(props.repositoryKey, props.fork.fork_repository_id, { headers: props.headers });
  const [currentFork, setCurrentFork] = useState(props.fork);
  useEffect(() => {
    setCurrentFork(props.fork);
  }, [props.fork]);

  return h("li", {
    className: "git-browser-list-item",
    children: [
      h("strong", { key: "name", children: currentFork.fork_repository_id }),
      h("div", {
        className: "git-browser-note",
        key: "status",
        children: `Ahead ${currentFork.fork_status.ahead} · Behind ${currentFork.fork_status.behind} · ${currentFork.fork_status.fork_branch} vs ${currentFork.fork_status.upstream_branch}`,
      }),
      h("button", {
        className: "git-browser-action-button",
        disabled: syncFork.loading,
        key: "sync",
        onClick: async () => {
          setCurrentFork(await syncFork.mutate({ strategy: "ff-only" }));
        },
        type: "button",
        children: syncFork.loading ? "Syncing..." : "Sync Fork",
      }),
    ],
  });
}

function GitRepositoryForksPageInner(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const forks = useGitForks(props.repositoryKey, {
    headers: props.headers,
  });

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "forks",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: forks.error,
        key: "status",
        loading: overview.loading || forks.loading,
        children: h(Card, {
          title: "Fork Network",
          subtitle: "Create forks, then sync them against upstream from this page.",
          children: h("ul", {
            className: "git-browser-list",
            children: (forks.data || []).map((fork) => h(ForkRow, {
              fork,
              headers: props.headers,
              key: fork.fork_repository_id,
              repositoryKey: props.repositoryKey,
            })),
          }),
        }),
      }),
    ],
  });
}

function GitRepositoryActivityPageInner(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
  const overview = useGitOverview(props.repositoryKey, {
    headers: props.headers,
    initialData: props.initialData || null,
  });
  const activity = useGitActivity(props.repositoryKey, {
    headers: props.headers,
  });

  return h("div", {
    className: joinClassNames("git-browser-page", props.className),
    children: [
      h(RepositoryHeader, {
        current: "activity",
        headers: props.headers,
        key: "header",
        navigate: props.navigate,
        overview: overview.data,
        repositoryKey: props.repositoryKey,
      }),
      h(StatusBlock, {
        error: activity.error,
        key: "status",
        loading: overview.loading || activity.loading,
        children: h(Card, {
          title: "Activity Timeline",
          children: h("ul", {
            className: "git-browser-list",
            children: (activity.data || []).map((entry) => (
              h("li", {
                className: "git-browser-list-item",
                key: entry.id,
                children: [
                  h("strong", { key: "summary", children: entry.summary }),
                  h("div", { className: "git-browser-note", key: "meta", children: `${entry.kind} · actor ${entry.actor_id} · ${formatDate(entry.created_at)}` }),
                ],
              })
            )),
          }),
        }),
      }),
    ],
  });
}

function GitRepositoryOverviewPage(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
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

function GitRepositoryReleasesPage(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
  return withBrowserProvider(props, () => h(GitRepositoryReleasesPageInner, props));
}

function GitRepositoryReleasePage(props: GitRepositoryReleasePageProps) {
  return withBrowserProvider(props, () => h(GitRepositoryReleasePageInner, props));
}

function GitRepositoryForksPage(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
  return withBrowserProvider(props, () => h(GitRepositoryForksPageInner, props));
}

function GitRepositoryActivityPage(props: GitBrowserPageProps<GitForgeRepositoryOverview>) {
  return withBrowserProvider(props, () => h(GitRepositoryActivityPageInner, props));
}

export {
  GitBrowserProvider,
  GitRepositoryActivityPage,
  GitRepositoryCodePage,
  GitRepositoryCommitPage,
  GitRepositoryCommitsPage,
  GitRepositoryForksPage,
  GitRepositoryOverviewPage,
  GitRepositoryReleasePage,
  GitRepositoryReleasesPage,
};

export type {
  GitBrowserPageProps,
  GitBrowserProviderProps,
  GitRepositoryCodePageProps,
  GitRepositoryCommitPageProps,
  GitRepositoryCommitsPageProps,
  GitRepositoryReleasePageProps,
};
