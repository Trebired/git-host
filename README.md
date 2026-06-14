# @trebired/git-host

Embeddable Git forge for Node.js and Bun apps with real Git CLI execution, smart HTTP and SSH transports, repository inspection APIs, forge features such as releases and forks, and optional React/browser companions.

`@trebired/git-host` gives your app real Git repository operations, forge-style repository metadata, and real Git transports without forcing you into a monolithic hosted product. It runs the real Git CLI, helps you resolve repository paths safely, serializes mutations per repository, and exposes reusable APIs for repository initialization, summary reads, content inspection, branch operations, working-tree changes, releases, forks, stars, watching, activity feeds, JSON API handlers, browser-ready pages, and smart HTTP and SSH hosting.

It is aimed at platforms and products that already own users, permissions, tokens, repository records, and UI, but want to stop hand-rolling the Git layer underneath all of that.

The package keeps auth, permission, and persistence decisions host-owned while giving you reusable Git behavior, forge adapters, and browser integration.

It also exposes an optional React companion at `@trebired/git-host/react` for typed API clients, providers, and headless data hooks, plus an optional browser UI entry at `@trebired/git-host/browser` for full repository pages.

In plain terms:

- it is a Git hosting and lightweight forge layer you embed into your app
- it is not a full hosted SaaS product with built-in accounts, billing, or platform ownership
- it is not a reimplementation of Git
- it uses the real `git` binary for the hard parts

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/git-host
```

```sh
npm install @trebired/logger
```

Optional React companion:

```sh
npm install react
```

Optional browser pages:

```sh
npm install react
```

```ts
import { createGitHost, resolveRepositoryPath } from "@trebired/git-host";
import { createLog } from "@trebired/logger";

const log = createLog({
  console: true,
  quiet: true,
  save: false,
});

const repositoriesRoot = "/srv/git-workspaces";

const gitHost = createGitHost({
  logger: log,
  resolveRepository(repositoryId) {
    return {
      id: repositoryId,
      path: resolveRepositoryPath({
        rootDir: repositoriesRoot,
        repositoryPath: `${repositoryId}/workspace`,
      }),
    };
  },
});

await gitHost.ensureRepository("demo", {
  actor: {
    name: "Alice",
    email: "alice@example.com",
  },
});

const summary = await gitHost.readSummary("demo");
console.log(summary.repository.current_branch);

const linguist = await gitHost.readLinguist("demo", {
  ref: "main",
  onProgress(event) {
    console.log(event.stage, event.percent);
  },
});
console.log(linguist.languages.results);

const tree = await gitHost.listTree("demo", {
  ref: "main",
  recursive: true,
  linguist: true,
  icons: true,
});
console.log(tree[0]?.language, Boolean(tree[0]?.icon));

const tags = await gitHost.listTags("demo");
const blame = await gitHost.readBlame("demo", {
  ref: "main",
  path: "src/app.ts",
});
const search = await gitHost.search("demo", {
  ref: "main",
  path: "src",
  query: "value",
});
const archive = await gitHost.readArchive("demo", {
  ref: "main",
  format: "zip",
});
console.log(tags.length, blame.lines[0]?.author_name, search.match_count, archive.file_name);

const inspectionTarget = await gitHost.resolveInspectionTarget("demo", {
  ref: "auto",
});
console.log(inspectionTarget.state, inspectionTarget.resolved_ref);

const treeSnapshot = await gitHost.readTree("demo", {
  ref: "auto",
  recursive: true,
  nested: true,
  ascii: true,
  icons: true,
  linguist: true,
});
console.log(treeSnapshot.ascii);

const directorySnapshot = await gitHost.readDirectory("demo", {
  path: "src",
  ref: "auto",
  icons: true,
  linguist: true,
  includeLineCounts: true,
});
console.log(directorySnapshot.kind);

const fileSnapshot = await gitHost.readFile("demo", {
  path: "src/app.ts",
  ref: "auto",
  includeLanguage: true,
  includeIcon: true,
});
console.log(fileSnapshot.language, fileSnapshot.icon?.name);

const repositoryAnalysis = await gitHost.readRepositoryAnalysis("demo", {
  ref: "auto",
  icons: true,
  nested: true,
  ascii: true,
  onProgress(event) {
    console.log(event.phase, event.percent);
  },
});
console.log(repositoryAnalysis.linguist.languages.results);

const workingTree = await gitHost.readWorkingTree("demo");
console.log(workingTree.unstaged_entries);

await gitHost.fetch("demo", {
  remoteCredentials: {
    username: "git-user",
    password: process.env.GIT_TOKEN || "",
  },
});
```

Smart HTTP hosting:

```ts
import { createServer } from "node:http";
import { createGitHost, createGitHttpHandler } from "@trebired/git-host";
import { createLog } from "@trebired/logger";

const log = createLog({
  console: true,
  quiet: true,
  save: false,
});

const gitHost = createGitHost({
  resolveRepository(repositoryId) {
    return {
      id: repositoryId,
      path: `/srv/git-workspaces/${repositoryId}/workspace`,
    };
  },
});

const server = createServer(createGitHttpHandler({
  basePath: "/git",
  logger: log,
  resolveRepository(repositoryKey) {
    return {
      id: repositoryKey,
      path: `/srv/git-workspaces/${repositoryKey}/workspace`,
    };
  },
}));

server.listen(3000);
```

Then clients can use:

```sh
git clone http://127.0.0.1:3000/git/demo.git
git push
```

SSH hosting:

```ts
import { createGitSshServer } from "@trebired/git-host";
import { createLog } from "@trebired/logger";

const log = createLog({
  console: true,
  quiet: true,
  save: false,
});

const sshServer = createGitSshServer({
  hostKeys: [hostPrivateKeyPem],
  logger: log,
  authenticate({ publicKey, username }) {
    if (username !== "git") return null;
    const account = findAccountBySshPublicKey(publicKey);
    if (!account) return null;
    return {
      publicKey: account.publicKey,
      remoteUser: account.username,
      identity: account,
    };
  },
  resolveRepository(repositoryKey) {
    return {
      id: repositoryKey,
      path: `/srv/git-workspaces/${repositoryKey}/workspace`,
    };
  },
});

sshServer.listen(2222, "0.0.0.0");
```

Then clients can use:

```sh
git clone ssh://git@127.0.0.1:2222/demo.git
git push
```

JSON API hosting:

```ts
import { createServer } from "node:http";
import { createGitApiHandler, createGitApiSocketServer, createGitHost } from "@trebired/git-host";
import { createLog } from "@trebired/logger";

const log = createLog({
  console: true,
  quiet: true,
  save: false,
});

const gitHost = createGitHost({
  resolveRepository(repositoryId) {
    return {
      id: repositoryId,
      path: `/srv/git-workspaces/${repositoryId}/workspace`,
    };
  },
});

const apiServer = createServer(createGitApiHandler({
  basePath: "/api/git",
  gitHost,
  logger: log,
  authorize({ action, repositoryId }) {
    return canReadRepository(repositoryId, action);
  },
}));

createGitApiSocketServer({
  basePath: "/api/git",
  gitHost,
  httpServer: apiServer,
  logger: log,
  authorize({ action, repositoryId }) {
    return canReadRepository(repositoryId, action);
  },
});

apiServer.listen(3100);
```

Then apps can use routes like:

```txt
GET /api/git/repositories/demo/summary
GET /api/git/repositories/demo/branches
GET /api/git/repositories/demo/commits?limit=20&ref=main&path=src/app.ts
GET /api/git/repositories/demo/commits/<commit-ref>
GET /api/git/repositories/demo/tags
GET /api/git/repositories/demo/tags/v1
GET /api/git/repositories/demo/tree?ref=HEAD&path=src&linguist=true&icons=true
GET /api/git/repositories/demo/linguist?ref=HEAD
GET /api/git/repositories/demo/blame?ref=HEAD&path=src/app.ts
GET /api/git/repositories/demo/search?ref=HEAD&path=src&query=value
GET /api/git/repositories/demo/archive?ref=HEAD&format=zip
GET /api/git/repositories/demo/blob?ref=HEAD&path=README.md
GET /api/git/repositories/demo/diff?baseRef=main&headRef=feature%2Fx&path=src
```

React companion:

```ts
import { createGitApiClient, GitApiClientProvider, useGitLinguist, useGitRepositorySummary } from "@trebired/git-host/react";

const gitClient = createGitApiClient({
  baseUrl: "/api/git",
});

function RepositorySummaryCard() {
  const summary = useGitRepositorySummary("demo");
  const linguist = useGitLinguist("demo", { ref: "main" });

  if (summary.loading) return "Loading...";
  if (summary.error) return summary.error.message;
  if (!summary.data) return "Missing repository";

  return `${summary.data.repository.current_branch} @ ${summary.data.repository.head_short} (${Object.keys(linguist.data?.languages.results || {}).length} languages)`;
}

function App() {
  return (
    <GitApiClientProvider client={gitClient}>
      <RepositorySummaryCard />
    </GitApiClientProvider>
  );
}
```

For long-running repository scans, the typed client also exposes a live Socket.IO linguist stream:

```ts
const socket = gitClient.openLinguistSocket("demo", {
  ref: "main",
  onProgress(event) {
    console.log(event.stage, event.percent);
  },
  onResult(event) {
    console.log(event.data.languages.results);
  },
});

await socket.completed;
```

The React entry is intentionally headless. It helps apps fetch and mutate Git data consistently, but it does not ship a bundled styled UI.

## Current API

The first public slice is intentionally small:

- `createGitHost()`
- `resolveRepositoryPath()`
- `runGit()`
- `buildGitEnv()`
- `RepositoryLockManager`
- `createGitApiHandler()`
- `createGitApiSocketServer()`
- `createGitHttpHandler()`
- `generateSshKeyPair()`
- `normalizeSshPublicKey()`
- `compareSshPublicKeys()`
- `fingerprintSshPublicKey()`
- `createGitSshServer()`
- `@trebired/git-host/react`

And the main host instance methods:

- `ensureRepository()`
- `readSummary()`
- `listBranches()`
- `listCommits()`
- `listTags()`
- `listTree()`
- `readLinguist()`
- `readBlame()`
- `search()`
- `readArchive()`
- `readBlob()`
- `readCommit()`
- `readTag()`
- `diff()`
- `readWorkingTree()`
- `readStagedFile()`
- `readUnstagedFile()`
- `createBranch()`
- `createTag()`
- `checkoutBranch()`
- `checkoutRef()`
- `deleteBranch()`
- `deleteTag()`
- `stagePaths()`
- `unstagePaths()`
- `discardPaths()`
- `commit()`
- `merge()`
- `rebase()`
- `cherryPick()`
- `continueOperation()`
- `abortOperation()`
- `fetch()`
- `pull()`
- `push()`
- `withRepositoryLock()`

The React entry currently exports:

- `createGitApiClient()`
- `GitApiClientProvider`
- `openLinguistSocket()` through the typed client instance
- `useGitRepositorySummary()`
- `useGitBranches()`
- `useGitCommits()`
- `useGitCommit()`
- `useGitTags()`
- `useGitTag()`
- `useGitTree()`
- `useGitLinguist()`
- `useGitBlame()`
- `useGitSearch()`
- `useGitArchive()`
- `useGitBlob()`
- `useGitDiff()`
- `useGitApiQuery()`

## Repository Model

This package does not own your app database.

Your app resolves a repository id to an absolute repository path. The package then runs Git operations against that path. This keeps repository metadata, permissions, tokens, SSH keys, and UI decisions inside the host app where they belong.

The current public API is worktree-first because that keeps the reusable boundary compact and predictable.

Private remotes are still host-owned. The package now helps with the transport plumbing by supporting:

- `remoteCredentials` for clone, fetch, pull, and push
- `httpHeaders` for per-command HTTP headers such as bearer auth
- `sshCommand` for per-command SSH transport overrides

## Why This Package

Most alternatives fall into one of three buckets:

- full forge products such as GitLab, Gitea, or Forgejo
- Git implementation libraries that reimplement Git behavior in another runtime
- one-off app code that shells out to `git` without a reusable boundary

`@trebired/git-host` is aiming at the gap between those options.

Use it when you want:

- your app to keep owning users, permissions, tokens, SSH keys, repository records, and UI
- real Git behavior from the system `git` binary
- clone, fetch, pull, and push over smart HTTP and SSH
- a reusable Git runtime instead of spreading Git shell calls all over your platform code
- optional headless React helpers over the JSON API without coupling the core package to a UI framework

Do not use it when you want:

- a ready-made Git product with issues, pull requests, teams, admin screens, and built-in account management
- a pure JavaScript Git implementation with no `git` binary dependency

That makes it useful for internal developer platforms, product-specific source management, deployment systems, controlled automation environments, and apps that need Git as a capability rather than Git hosting as a separate product.

## Path Safety

Repository paths should never come straight from request input.

The intended flow is:

```txt
request repo id -> host app record lookup -> absolute repository path -> git-host
```

`resolveRepositoryPath()` is provided as a safe join helper when your host app stores repository-relative paths under one known root.

## Hosted Transport Hooks

Hosted transports keep identity and permission policy in your app.

- `createGitHttpHandler()` supports host-owned repository resolution, optional identity resolution, permission checks, and request audit events.
- `createGitSshServer()` supports host-owned public key authentication, permission checks, and command audit events.
- `createGitApiHandler()` supports host-owned repository id mapping and per-route authorization.
- `createGitApiSocketServer()` supports host-owned Socket.IO progress delivery for long-running linguist scans with the same repository mapping and authorization hooks.
- `generateSshKeyPair()`, `normalizeSshPublicKey()`, `compareSshPublicKeys()`, and `fingerprintSshPublicKey()` help host apps manage SSH transport setup without owning the parsing details themselves.

## Platform Fit

`@trebired/git-host` is a good fit when a larger platform already owns users, permissions, repository records, tokens, SSH keys, and UI, but wants to stop hand-rolling the reusable Git layer.

The package is meant to replace or simplify:

- Git CLI execution and environment shaping
- repository locking and mutation coordination
- repository summary, tree, linguist, blame, search, archive, blob, commit, diff, and working-tree reads
- branch, tag, checkout, commit, merge, rebase, cherry-pick, fetch, pull, and push operations
- smart HTTP and SSH Git transport handling
- thin JSON API route internals around those Git operations

The host platform should still own:

- repository and source metadata persistence
- permission checks and route authorization policy
- access token issuance, revocation, and storage
- SSH key ownership, private key storage, and known-host persistence
- merge requests, reviews, UI flows, and other product-specific features

That boundary is where the package simplifies a platform the most without turning into a forge product of its own.

## Logger Support

`@trebired/git-host` works best with `@trebired/logger`, and that is the recommended logger.

Why we recommend it:

- it is simple
- it already matches git-host's expected method shape
- it keeps application logs and git-host diagnostics in one consistent format

The logger style:

```ts
log.info("git-host", "initializing repository", { repositoryId: "demo" });
```

comes from `@trebired/logger`.

The runtime adaptation behind `logger` and `loggerAdapter` is powered by `@trebired/logger-adapter`.

You can pass that same `log` object into `createGitHost()`, `createGitHttpHandler()`, `createGitSshServer()`, `createGitApiHandler()`, and `createGitApiSocketServer()` through their `logger` option.

If you do not pass a logger and `@trebired/logger` is installed in the host app, git-host will create a quiet console-only logger automatically before falling back to raw `console`.

If you also set `verbose: true`, git-host will emit successful lifecycle and transport diagnostics through that logger. Without `verbose`, it stays much quieter and mainly reports rejected or failed operations.

Custom loggers can also use one of these shapes:

```ts
type Logger = {
  info(group: string, message: string, metadata?: unknown): void;
  warn(group: string, message: string, metadata?: unknown): void;
  error(group: string, message: string, metadata?: unknown): void;
  fail(group: string, message: string, metadata?: unknown): void;
};

type Event = {
  level: "info" | "warn" | "error" | "fail";
  group: string;
  message: string;
  metadata?: unknown;
};

type EventLogger = (event: Event) => void;

type SinkLogger = {
  log?(event: Event): void;
  write?(event: Event): void;
  fatal?(message: string, metadata?: unknown): void;
};
```

Common logger objects such as `console`, pino-style level methods, or Winston-style sinks are also adapted as sensibly as possible.

If you want exact control over the emitted structure, pass `logger` plus `loggerAdapter`:

```ts
const rows: unknown[] = [];

const host = createGitHost({
  logger: rows,
  loggerAdapter(logger, event) {
    logger.push({
      when: event.timestamp,
      scope: event.group,
      severity: event.level,
      text: event.message,
      extra: event.metadata,
    });
  },
  resolveRepository(repositoryId) {
    return {
      id: repositoryId,
      path: `/srv/repos/${repositoryId}`,
    };
  },
});
```

If no logger is provided and `@trebired/logger` is not installed, git-host falls back to plain `console` output for its own diagnostics.

## Roadmap

The remaining package work is mostly convenience and hardening:

- thin Express wrappers when they stay truly thin
- broader examples for host-app integration patterns

## Contributing

See `CONTRIBUTING.md` for development commands and package guidelines.
