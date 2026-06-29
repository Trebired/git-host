# @trebired/git-host

Embeddable Git host and forge for Node.js and Bun apps with real Git CLI execution, smart HTTP and SSH transports, repository APIs, normalized repository activity, and repository-owned Actions workflows.

`@trebired/git-host` is meant for larger self-hosted products that already own users, permissions, storage, and UI, but do not want to keep rebuilding the Git and forge layer underneath them.

It is:

- a reusable Git host/runtime layer for your app
- a forge layer with releases, forks, social state, activity, and Actions
- built on the real `git` binary

It is not:

- a hosted SaaS
- a fake in-memory Git implementation
- a frontend/UI package

## Install

Runtime support:

- Node.js 18+
- Bun 1+
- `git` available on the host

```sh
npm install @trebired/git-host
```

For the packaged Actions runner binaries, the npm package ships Linux GNU and macOS builds. If you are working locally from source, the runtime can also fall back to the TypeScript runner path when a packaged binary is not present.

## Quick Start

```ts
import { createGitHost, resolveRepositoryPath } from "@trebired/git-host";

const repositoriesRoot = "/srv/git-workspaces";

const gitHost = createGitHost({
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
    email: "alice@example.com",
    name: "Alice",
  },
});

const summary = await gitHost.readSummary("demo");
console.log(summary.repository.current_branch);
```

## Actions Model

Repository Actions are repository-owned. Workflows are discovered from files committed inside the repository itself, not from top-level global records.

Default layout:

```text
<repository-worktree>/
  .git-host/
    workflows/
      build.yml
      release.yml
```

The `workflows/` directory is intentional. It keeps the model familiar and gives you room to add more package-owned repository metadata under the configurable root later.

### Workflow File

Example workflow file:

```yaml
name: Build and test
trigger: push
source:
  branches:
    - main
steps:
  - name: Install
    run: bun install
  - name: Test
    run: bun test
  - name: Build
    run: bun run build
```

Supported trigger values in v1:

- `push`
- `release.create`
- `release.update`
- `manual`

Each workflow file is exposed through the forge API as a repository-owned workflow record. The stable workflow id is the repository-relative definition path, for example:

```text
.git-host/workflows/build.yml
```

### Custom Workflow Root

The root folder is configurable. The folder name does not have to stay `.git-host`.

```ts
import { createGitForge } from "@trebired/git-host";

const forge = createGitForge({
  actions: {
    workflowRoot: ".ci",
  },
  createForkRepository({ upstreamRepositoryId }) {
    return {
      id: `${upstreamRepositoryId}-fork`,
      path: resolveRepositoryPath({
        rootDir: repositoriesRoot,
        repositoryPath: `${upstreamRepositoryId}-fork/workspace`,
      }),
    };
  },
  gitHost,
  storage,
});
```

That makes the workflow layout:

```text
<repository-worktree>/
  .ci/
    workflows/
      build.yml
```

You can also resolve the workflow root per repository:

```ts
actions: {
  async resolveWorkflowRoot(repositoryId) {
    return repositoryId.startsWith("legacy-") ? ".ci" : ".git-host";
  },
}
```

## Actions Execution

Workflow runs are persistent and repository-owned:

- workflows are loaded from the triggering ref/commit
- each run materializes an exact snapshot for that ref/commit
- steps run sequentially
- stdout and stderr are captured and persisted
- live run events are streamed over Socket.IO
- queued/running runs can be cancelled

The runtime emits persisted run events such as:

- `run.accepted`
- `run.status`
- `step.started`
- `step.output`
- `step.heartbeat`
- `step.finished`
- `run.finished`
- `run.failed`
- `run.cancelled`

## Activity Integration

Repository activity is normalized and repository-owned. Activity entries are returned through the repository activity API and can be used to trigger workflows.

Examples of normalized kinds:

- `repository.push`
- `repository.pull`
- `repository.fetch`
- `release.create`
- `release.update`
- `release.delete`
- `repository.fork.create`
- `repository.fork.sync`
- `repository.star`
- `repository.unstar`
- `repository.watch`
- `repository.unwatch`

Push-triggered Actions can be created from:

- smart HTTP pushes
- SSH pushes
- programmatic host/forge push operations

## Smart HTTP And SSH

### HTTP

```ts
import { createServer } from "node:http";
import { createGitHttpHandler } from "@trebired/git-host";

const server = createServer(createGitHttpHandler({
  basePath: "/git",
  resolveRepository(repositoryKey) {
    return {
      id: repositoryKey,
      path: `/srv/git-workspaces/${repositoryKey}/workspace`,
    };
  },
}));

server.listen(3000);
```

### SSH

```ts
import { createGitSshServer } from "@trebired/git-host";

const server = createGitSshServer({
  hostKeys: [process.env.GIT_HOST_SSH_KEY || ""],
  resolveRepository(repositoryKey) {
    return {
      id: repositoryKey,
      path: `/srv/git-workspaces/${repositoryKey}/workspace`,
    };
  },
});

server.listen(2222);
```

## Forge Layer

Use `createGitForge()` when you want repository releases, forks, activity, social state, and Actions on top of the Git host:

```ts
import {
  createGitForge,
  createGitForgeActivityRecorder,
  createInMemoryGitForgeStorageAdapter,
  createGitHost,
} from "@trebired/git-host";

const storage = createInMemoryGitForgeStorageAdapter();
const activity = createGitForgeActivityRecorder({
  storage: storage.activity,
});

const gitHost = createGitHost({
  activity,
  resolveRepository(repositoryId) {
    return {
      id: repositoryId,
      path: `/srv/git-workspaces/${repositoryId}/workspace`,
    };
  },
});

const forge = createGitForge({
  actions: {
    workflowRoot: ".git-host",
    workspaceRoot: "/srv/git-actions-workspaces",
  },
  createForkRepository({ upstreamRepositoryId }) {
    return {
      id: `${upstreamRepositoryId}-fork`,
      path: `/srv/git-workspaces/${upstreamRepositoryId}-fork/workspace`,
    };
  },
  gitHost,
  storage,
});
```

## JSON API And Live Sockets

The package exposes backend API helpers:

- `createGitApiHandler()`
- `createGitForgeApiHandler()`
- `createGitApiSocketServer()`
- `createGitForgeSocketServer()`

The forge socket server supports live workflow run viewing with replay from a sequence cursor so disconnected clients can catch up from persisted events.

## Packaging

The npm package ships:

- the backend TypeScript runtime
- packaged Actions runner binaries under `bin/`
- no browser or React entrypoints

Repository Actions workflow binaries are built in CI for:

- Linux x64 GNU
- Linux arm64 GNU
- macOS x64
- macOS arm64

## License

MIT
