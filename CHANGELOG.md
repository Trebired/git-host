# Changelog

All notable changes to `@trebired/git-host` will be documented here.

This project follows semantic versioning once published.

## 1.8.0

- Added host-owned archive ergonomics so callers can customize source archive filenames, outer root-directory naming, and generated archive URLs without changing repository identity or cache behavior.
- Added exported HTTP helpers for archive and uploaded release-asset downloads, including consistent content headers, redirect handling, and `HEAD` support for host-owned routes.
- Extended forge release asset transport support with typed asset links/downloads, optional host URL builders and openers, client helpers, browser links, and a reusable forge asset download route.
- Updated the README with default archive behavior, customization examples, and host-owned route patterns, and added coverage for filename customization, URL generation, response headers, and release asset downloads.

## 1.7.0

- Added first-class host-managed source archives for branches, tags, commits, and forge releases through SHA-resolved `zipball` and `tarball` download routes backed by `git archive`.
- Added streamed archive generation with deterministic commit-root folders, pluggable archive cache backends, filesystem cache support, TTL cleanup, structured archive error codes, and archive request/cache/generation audit logs.
- Extended release and tag API/browser models with automatic source archive links that stay distinct from uploaded release assets.

## 1.6.0

- Made package styling optional instead of required for frontend integration by adding `unstyled` support across the shared repository UI provider and browser pages.
- Added slot-based frontend skinning through `theme.classNames`, `theme.slots`, stable `data-slot` markers, and exported slot helpers so host apps can keep their own design system while reusing git-host structure.
- Added render-state component overrides for loading, error, and empty states through `GitRepositoryUiProvider`.
- Updated the README with explicit package structure plus app styling guidance and examples that do not depend on `@trebired/git-host/browser/styles.css`.

## 1.5.0

- Expanded the frontend ownership model across `@trebired/git-host/browser` and `@trebired/git-host/react` with a package-owned repository shell, route adapter system, diagnostics hooks, theme/token support, and shared UI provider state.
- Added reusable React repository components and action primitives such as `GitRepositoryShell`, `GitRepositoryHeader`, `GitRepositoryTabs`, `GitCommitList`, `GitReleaseList`, `GitForkList`, `GitTreeView`, `GitBlobView`, `GitBranchSelector`, `GitTagSelector`, and repository action buttons.
- Extended the browser entry to ship a broader first-class repository page surface including branches, tags, search, blame, compare, and richer release flows in addition to the existing overview/code/commits/releases/forks/activity pages.
- Added query dedupe/caching plus frontend diagnostics hooks for fetch, action, render, empty-state, and navigation observation.
- Updated the README with explicit frontend integration modes and thinner host-app examples.

## 1.4.0

- Added a new forge layer through `createGitForge()` with host-owned storage adapters for releases, forks, stars, watching, and repository activity timelines.
- Added `createGitForgeApiHandler()` plus new repository routes for overview, social state, releases, forks, fork sync, and activity while keeping the existing read-only JSON API stable.
- Extended the typed React client and hooks with forge reads and mutations, including optimistic star and watch helpers.
- Added `@trebired/git-host/browser` with reusable SSR-safe repository pages and bundled browser styles for overview, code, commits, releases, forks, and activity views.
- Added an in-memory forge storage adapter for tests, prototypes, and local embedding.

## 1.3.0

- Added a first-class repository inspection layer with `resolveInspectionTarget()`, `readTree()`, `readDirectory()`, `readFile()`, and `readRepositoryAnalysis()`.
- Added generic auto-ref resolution with safe empty/unborn repository handling for inspection calls, without assuming the repository default branch.
- Added nested-tree and ASCII-tree helpers through `nestTreeEntries()` and `formatTreeAscii()`.
- Added normalized high-level inspection progress events alongside the existing raw linguist progress stream.
- Added structured inspection result types for tree, directory, file, and repository analysis snapshots.

## 1.2.0

- Added package startup logs through package-specific `.initialize` groups such as `git-host.initialize`, `git-host.http.initialize`, `git-host.api.initialize`, and `git-host.ssh.initialize`.

## 1.1.0

- Switched package logger adaptation over to `@trebired/logger-adapter`.
- Added the `loggerAdapter(logger, event)` option across the logging entrypoints for callers who want exact control over the final emitted log structure.

## 1.0.0

- Marked `@trebired/git-host` as stable and bumped the package to `1.0.0`.
- Replaced the earlier live linguist scan streaming transport with Socket.IO through `createGitApiSocketServer()` and the typed `openLinguistSocket()` client helper.
- Promoted the current public API surface, including the core host, JSON API handler, smart HTTP and SSH transports, React client and hooks, and Socket.IO progress transport, as the first stable release contract.

## 0.2.0

- Added repository linguist analysis through `readLinguist()` with ref-based text blob inspection powered by `linguist-js`.
- Added live linguist progress reporting through `readLinguist(..., { onProgress })` and the initial API/client streaming support for long-running scans.
- Added optional tree entry enrichment for detected file languages and inline SVG icons from `material-icon-theme`.
- Added tag APIs for listing, reading, creating, and deleting tags.
- Added path- and ref-scoped commit history plus path-scoped diff filtering.
- Added blame, search, and archive reads for deeper repository inspection.
- Added merge, rebase, and cherry-pick start helpers to the core host API.
- Added JSON API routes, typed client methods, and React hooks for linguist, tags, blame, search, archive, and enriched tree reads.
- Added tests and README coverage for the expanded repository inspection surface.

## 0.1.0

- Added the initial `@trebired/git-host` package scaffold with publishable metadata, README, MIT license, contribution guide, and TypeScript build setup.
- Added a reusable core `createGitHost()` API for worktree-backed repositories with real Git CLI execution, repository summary reads, tree and blob inspection, commit and ref comparison reads, working-tree mutation helpers, branch operations, checkout, remote fetch/pull/push helpers, and per-repository mutation locking.
- Added `createGitHttpHandler()` for plain Node smart HTTP hosting with host-owned repository resolution and optional authorization hooks.
- Added `createGitSshServer()` for plain Node SSH Git hosting with host-owned public key authentication, repository resolution, authorization hooks, and Git-only command execution.
- Added `createGitApiHandler()` for plain Node JSON API routing over repository summaries, branches, commits, trees, blobs, and diffs.
- Added `@trebired/git-host/react` as an optional React companion with a typed JSON API client, provider, and headless data hooks.
- Added hosted transport identity and audit hook support for smart HTTP and SSH adapters.
- Added `checkoutRef()`, `readStagedFile()`, and `readUnstagedFile()` to the core host API for detached ref checkout and pre-commit file inspection.
- Added host-owned remote transport auth ergonomics for clone, fetch, pull, and push through `remoteCredentials`, `httpHeaders`, and `sshCommand` options.
- Added SSH key utilities for generation, normalization, comparison, and fingerprinting.
- Added `@trebired/logger`-style logger support across the main git-host entrypoints with optional verbose diagnostics.
- Added hosted repository config defaults so worktree-backed repositories can accept smart HTTP push updates through the checked-out branch.
- Added tests covering repository init, clone, summary reads, tree and blob reads, staged and unstaged file reads, commit detail reads, working-tree staging and commit flows, branch operations, checkout, detached ref checkout, ref comparison, fetch/pull/push helpers, authenticated HTTP remote sync, operation continue and abort, JSON API reads, smart HTTP clone/push, smart HTTP auth hooks, SSH clone/push, SSH audit hooks, locking, and path rejection.
- Initial public release.
