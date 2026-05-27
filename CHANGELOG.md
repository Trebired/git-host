# Changelog

All notable changes to `@trebired/git-host` will be documented here.

This project follows semantic versioning once published.

## Unreleased

## 0.2.0

- Added repository linguist analysis through `readLinguist()` with ref-based text blob inspection powered by `linguist-js`.
- Added live linguist progress reporting through `readLinguist(..., { onProgress })`, plus Socket.IO delivery through `createGitApiSocketServer()` and the typed `openLinguistSocket()` client helper.
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
