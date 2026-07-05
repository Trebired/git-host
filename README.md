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

`git-host` now supports two workflow formats:

- legacy flat shell workflows for backward compatibility
- a documented GitHub-Actions-inspired subset for multi-job CI and publish pipelines

Legacy workflows still work:

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

The richer subset uses `on`, `jobs`, `needs`, matrix strategy, expressions, built-in `uses:` adapters, artifacts, and concurrency:

```yaml
name: Package publish
on:
  workflow_dispatch:
    inputs:
      publish:
        type: boolean
        default: false
      target_ref:
        type: string
        required: true
  push:
    tags:
      - v*
env:
  BUILD_DIR: dist
concurrency:
  group: publish-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
  packages: write
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target:
          - linux
          - darwin
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: |
          mkdir -p "${BUILD_DIR}"
          printf '%s\n' "${{ matrix.target }}" > "${BUILD_DIR}/${{ matrix.target }}.txt"
      - uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.target }}
          path: dist/${{ matrix.target }}.txt

  publish:
    needs: build
    runs-on: ubuntu-latest
    if: ${{ needs.build.result == 'success' }}
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-linux
          path: publish-assets
      - name: Publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          test -n "${NPM_TOKEN}"
          ls -R publish-assets
          printf 'publishing from %s\n' "${{ github.ref }}"
      - uses: actions/publish-release-asset@v1
        with:
          name: mytool-linux-x64
          path: publish-assets
          format: tar.gz
```

Supported subset:

- top-level `name`, `on`, `env`, `permissions`, and `concurrency`
- `on.workflow_dispatch.inputs` with `string` and `boolean` types, defaults, and required flags
- `on.push.branches` and `on.push.tags` with exact matches or `*` wildcards
- multiple `jobs`
- per-job `name`, `runs-on`, `needs`, `if`, `env`, `strategy.matrix`, and `steps`
- shell steps with `run`
- built-in `uses:` handlers for:
  - `actions/checkout@v4`
  - `actions/setup-node@v4`
  - `oven-sh/setup-bun@v2`
  - `actions/upload-artifact@v4`
  - `actions/download-artifact@v4`
  - `actions/publish-release-asset@v1` (no GitHub equivalent — see below)
- expressions in common places such as env values, `if`, shell commands, concurrency groups, and built-in action `with` values
- expression contexts:
  - `github.ref`
  - `github.ref_name`
  - `github.event_name`
  - `github.event.inputs.<name>`
  - `matrix.<name>`
  - `secrets.<name>`
  - `env.<name>`
  - `job.status`
  - `needs.<job>.result`

### Publishing Release Assets

`actions/publish-release-asset@v1` compresses a downloaded/checked-out path into a real
`.tar.gz` or `.zip` and attaches it to a release as a `GitForgeReleaseAsset` with a
`storage_pointer` your host's `releaseAssetStore.openAssetDownload()` resolves at
download time — the same asset shape and download path the release API already
serves. GitHub Actions has no built-in equivalent for this (you'd reach for a
marketplace action like `softprops/action-gh-release`); this is an intentional
first-party addition to git-host's Actions, not an attempt to mirror GitHub syntax
for something GitHub doesn't ship itself.

```yaml
- uses: actions/publish-release-asset@v1
  with:
    name: mytool-linux-x64   # required; archive extension is added automatically
    path: dist/linux         # required; file or directory, relative to the workspace
    format: tar.gz           # optional, "tar.gz" (default) or "zip"
    tag: v1.2.3              # optional; defaults to github.ref_name
```

The target release must already exist — this step does not create one. Resolution
order: `with.tag` if given, else the run's `release_id` (set automatically when the
workflow was triggered by `release.create`), else a release matching `with.tag`/
`github.ref_name` by `tag_name`. If none is found, the step fails with a clear error
rather than guessing at release metadata (author, target ref, draft state) that
belongs to the proper release-creation flow. Successful publishes emit a
`release_asset.published` run event.

Intentional differences from GitHub Actions:

- this is not a full marketplace runner
- only the built-in `uses:` adapters above are supported
- unsupported `runs-on` labels fail clearly instead of pretending to be available
- matrix jobs run sequentially on the local runner in v1
- secrets are injected for expressions and runtime env, then redacted from streamed and persisted logs
- service containers and arbitrary marketplace actions are not supported in v1

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
- jobs and matrix children execute from staged snapshot workspaces, never from a dirty live working tree
- jobs honor `needs` ordering
- steps run sequentially inside each job
- stdout and stderr are captured and persisted
- host-provided env and secrets can be merged into the execution context
- named artifacts can be uploaded in one job and downloaded in dependent jobs
- live run events are streamed over Socket.IO
- queued/running runs can be cancelled
- workflow concurrency groups can block or cancel overlapping runs

The runtime emits persisted run events such as:

- `run.accepted`
- `run.cancellation_requested`
- `run.status`
- `job.started`
- `job.output`
- `job.heartbeat`
- `job.finished`
- `step.started`
- `step.output`
- `step.heartbeat`
- `step.finished`
- `artifact.uploaded`
- `artifact.downloaded`
- `release_asset.published`
- `run.finished`
- `run.failed`
- `run.cancelled`

### Host Context And Redaction

Hosts can inject per-repository execution context through `actions.resolveExecutionContext()`:

```ts
const forge = createGitForge({
  actions: {
    async resolveExecutionContext({ repositoryId, triggerKind, workflow }) {
      return {
        actor: {
          id: "ci-bot",
        },
        env: {
          CI: "true",
          REPOSITORY_ID: repositoryId,
        },
        metadata: {
          trigger_kind: triggerKind,
          workflow_name: workflow.name,
        },
        secrets: {
          NPM_TOKEN: process.env.NPM_TOKEN || "",
        },
      };
    },
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

Runtime env merge order (later layers win):

- clean base env (see below — **not** the full host `process.env` by default)
- static `actions.env`
- host-provided execution env
- workflow `env`
- job `env`
- step `env`
- host-provided secrets

#### Step environment isolation

By default the runtime does **not** spread the embedding process's `process.env`
into workflow steps, so host process secrets can never leak into (or be echoed
by) a workflow. Instead it builds a minimal base env from a small passthrough
allowlist needed for tooling to work: `PATH`, `HOME`, `LANG`, `LC_ALL`, `TZ`,
`TERM` (plus the platform equivalents on Windows). Everything else is opt-in via
`actions.environment`:

```ts
const forge = createGitForge({
  actions: {
    environment: {
      // Additive allowlist of extra process.env keys to expose to steps.
      passthrough: ["NODE_EXTRA_CA_CERTS"],
      // Explicit key/value pairs injected into the clean base env.
      baseEnv: { CI: "true" },
      // Key names whose resolved values are always masked from logs/output.
      sensitiveKeys: ["DEPLOY_KEY"],
      // Escape hatch: restore the pre-2.x behavior of inheriting the ENTIRE host
      // process env. Explicit opt-in, logged with a warning. Not redacted.
      inheritProcessEnv: false,
    },
  },
  gitHost,
  storage,
});
```

> **Migration note (breaking):** before this release every step inherited the
> full host `process.env`. If a workflow relied on an inherited variable, add it
> to `environment.passthrough` (or `environment.baseEnv`), or set
> `environment.inheritProcessEnv: true` to reproduce the old behavior exactly.

Secrets are available to expressions and the runtime env, but their values —
along with the resolved values of any `environment.sensitiveKeys` — are redacted
from:

- live socket output
- persisted event payloads (`step.output`/`job.output` chunks)
- step output previews
- step summaries derived from step/action errors

#### Local runner trust boundary and isolation hooks

The local runner executes each step as `spawn(shell, ["-lc", command])` **as the
host user, unsandboxed by default**, with full filesystem reach; only the per-job
git workspace is scratch. **Only run untrusted workflows behind a sandbox.** If
the runtime detects it is running as root with no `localRunner.uid` drop and no
`beforeSpawn` sandbox, it logs a warning at startup.

For a batteries-included sandbox on Linux, pass `createBubblewrapSandbox()` as the
`beforeSpawn` hook. It wraps each step in [bubblewrap](https://github.com/containers/bubblewrap)
(`bwrap` must be on `PATH`) with an isolated filesystem view (read-only system
paths plus a writable job workspace), no network, and fresh pid/ipc/uts/user
namespaces:

```ts
import { createBubblewrapSandbox, createGitForge } from "@trebired/git-host";

const forge = createGitForge({
  actions: {
    localRunner: {
      beforeSpawn: createBubblewrapSandbox({
        allowNetwork: false,          // default: no network for steps
        roBind: ["/opt/toolchain"],   // extra read-only host paths
        bind: [],                     // extra writable host paths
      }),
    },
  },
  gitHost,
  storage,
});
```

For finer control (or a different sandbox such as nsjail or a container),
`actions.localRunner` also exposes lower-level off-by-default knobs:

```ts
const forge = createGitForge({
  actions: {
    localRunner: {
      uid: 65534,              // drop privileges (passed to spawn where supported)
      gid: 65534,
      execTimeoutMs: 600_000,  // per-step wall-clock kill (SIGTERM -> SIGKILL)
      // Wrap the shell in your own sandbox (bwrap/nsjail/container). Return a
      // modified child spec, or nothing to keep the default.
      beforeSpawn(child) {
        return {
          ...child,
          command: "bwrap",
          args: ["--unshare-all", "--", child.command, ...child.args],
        };
      },
    },
  },
  gitHost,
  storage,
});
```

### Workflow APIs

The forge API exposes:

- list workflows
- read a workflow definition
- manually run a workflow with `inputs`, `env`, `secrets`, and trigger context
- cancel a workflow run
- list workflow runs
- read a workflow run
- list job runs
- list step runs
- list run artifacts
- list run events
- subscribe to live run events over Socket.IO

The HTTP API keeps the existing routes and adds run sub-collections such as:

- `GET /repositories/:repositoryKey/actions/runs/:runId/jobs`
- `GET /repositories/:repositoryKey/actions/runs/:runId/steps`
- `GET /repositories/:repositoryKey/actions/runs/:runId/artifacts`

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
    // Separate from workspaceRoot: published release assets must outlive the run
    // (and any per-run workspace cleanup) that produced them.
    releaseAssetsRoot: "/srv/git-release-assets",
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
- packaged Actions runner binaries under `runners/`
- no browser or React entrypoints

Repository Actions workflow binaries are built in CI for:

- Linux x64 GNU
- Linux arm64 GNU
- macOS x64
- macOS arm64
