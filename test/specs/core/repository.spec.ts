import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { createFileSystemGitArchiveCache, createGitHost } from "#rfvjfxzebkbs";
import {
  captureEventSink,
  captureLogger,
  createHost,
  git,
  gitCommit,
  resolveRepositoryPath,
  tempDir,
  writeFile,
} from "#cx668v9vcf0v";

test("initializes a repository, writes the managed exclude block, and reads a summary", async () => {
  const root = tempDir();
  const host = createHost(path.join(root, "repos"));
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Hello\n");

  const summary = await host.ensureRepository("demo", {
    actor: { name: "Alice", email: "alice@example.com" },
  });

  expect(summary.repository.current_branch).toBe("main");
  expect(summary.repository.head_commit).toBeTruthy();
  expect(summary.commits).toHaveLength(1);
  expect(summary.commits[0].subject).toBe("Initial import");
  expect(summary.status.clean).toBe(true);

  const excludeText = fs.readFileSync(path.join(workspace, ".git", "info", "exclude"), "utf8");
  expect(excludeText.includes("# Managed by @trebired/git-host")).toBe(true);
  expect(excludeText.includes("node_modules/")).toBe(true);
});

test("supports trebired logger-style diagnostics", async () => {
  const root = tempDir();
  const { logger, rows } = captureLogger();
  const host = createGitHost({
    logger,
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: `${repositoryId}/workspace` }),
      };
    },
    verbose: true,
  });
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Logger\n");
  await host.ensureRepository("demo");

  expect(rows.some((entry) => entry.level === "info" && entry.group === "trebired.git-host" && entry.message === "initializing repository")).toBe(true);
});

test("supports event-sink logger styles", async () => {
  const root = tempDir();
  const { logger, rows } = captureEventSink();
  const host = createGitHost({
    logger,
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: `${repositoryId}/workspace` }),
      };
    },
    verbose: true,
  });
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Logger Event\n");
  await host.ensureRepository("demo");

  expect(rows.some((entry) => entry.level === "info" && entry.group === "trebired.git-host" && entry.message === "initializing repository")).toBe(true);
});

test("supports explicit logger adapters for exact emitted shapes", async () => {
  const root = tempDir();
  const rows: Array<{ severity: string; text: string }> = [];
  const host = createGitHost({
    logger: rows as any,
    loggerAdapter(logger, event) {
      (logger as Array<{ severity: string; text: string }>).push({
        severity: event.level,
        text: `${event.timestamp} ${event.group} ${event.message}`,
      });
    },
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: `${repositoryId}/workspace` }),
      };
    },
    verbose: true,
  });
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Adapter\n");
  await host.ensureRepository("demo");

  expect(rows.some((entry) => entry.severity === "info" && entry.text.includes("git-host initializing repository"))).toBe(true);
});

test("lists, creates, and deletes branches", async () => {
  const root = tempDir();
  const host = createHost(path.join(root, "repos"));
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Hello\n");
  await host.ensureRepository("demo");

  await host.createBranch("demo", { name: "feature/test" });
  expect((await host.listBranches("demo")).some((entry) => entry.name === "feature/test")).toBe(true);

  await host.deleteBranch("demo", { name: "feature/test" });
  expect((await host.listBranches("demo")).some((entry) => entry.name === "feature/test")).toBe(false);
});

test("reads trees, blobs, commit details, compares refs, and checks out branches", async () => {
  const root = tempDir();
  const host = createHost(path.join(root, "repos"));
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Hello\n");
  writeFile(workspace, "src/app.ts", "export const value = 1;\n");

  const initialSummary = await host.ensureRepository("demo");
  expect((await host.listTree("demo")).some((entry) => entry.path === "README.md" && entry.type === "blob")).toBe(true);
  expect((await host.listTree("demo")).some((entry) => entry.path === "src" && entry.type === "tree")).toBe(true);
  expect((await host.listTree("demo", { path: "src" })).some((entry) => entry.path === "src/app.ts")).toBe(true);

  const blob = await host.readBlob("demo", { path: "README.md" });
  expect(blob.content).toBe("# Hello\n");

  const commit = await host.readCommit("demo", initialSummary.repository.head_commit);
  expect(commit.commit.subject).toBe("Initial import");
  expect(commit.files.some((entry) => entry.path === "README.md")).toBe(true);
  expect(commit.files.some((entry) => entry.path === "src/app.ts")).toBe(true);

  await host.createBranch("demo", { name: "feature/diff" });
  await host.checkoutBranch("demo", { name: "feature/diff" });
  writeFile(workspace, "src/app.ts", "export const value = 2;\n");
  writeFile(workspace, "src/new.ts", "export const next = true;\n");
  gitCommit(workspace, "Feature update");

  await host.checkoutBranch("demo", { name: "main" });
  const compare = await host.diff("demo", { baseRef: "main", headRef: "feature/diff" });
  expect(compare.commit_count).toBe(1);
  expect(compare.files.some((entry) => entry.path === "src/app.ts")).toBe(true);
  expect(compare.files.some((entry) => entry.path === "src/new.ts")).toBe(true);
});

test("generates branch, tag, and commit source archives with commit-resolved metadata", async () => {
  const root = tempDir();
  const host = createHost(path.join(root, "repos"));
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Archive\n");
  writeFile(workspace, "src/app.ts", "export const value = 1;\n");

  const summary = await host.ensureRepository("demo", {
    actor: { name: "Alice", email: "alice@example.com" },
  });
  await host.createTag("demo", {
    actor: { name: "Alice", email: "alice@example.com" },
    message: "Version 1",
    name: "v1",
    ref: "main",
  });

  const branchArchive = await host.readArchive("demo", { format: "tar.gz", ref: "main" });
  const tagArchive = await host.readArchive("demo", { format: "zip", ref: "v1" });
  const commitArchive = await host.readArchive("demo", { format: "tar.gz", ref: summary.repository.head_commit });

  const branchTar = gunzipSync(Buffer.from(branchArchive.content, "base64")).toString("utf8");
  const commitTar = gunzipSync(Buffer.from(commitArchive.content, "base64")).toString("utf8");
  const zipBuffer = Buffer.from(tagArchive.content, "base64");

  expect(branchArchive.resolved_commit).toBe(summary.repository.head_commit);
  expect(branchArchive.root_directory).toBe(`demo-${summary.repository.head_commit.slice(0, 12)}/`);
  expect(branchTar.includes(`${branchArchive.root_directory}README.md`)).toBe(true);
  expect(commitArchive.resolved_commit).toBe(summary.repository.head_commit);
  expect(commitTar.includes(`${commitArchive.root_directory}src/app.ts`)).toBe(true);
  expect(tagArchive.resolved_commit).toBe(summary.repository.head_commit);
  expect(tagArchive.file_name.endsWith(".zip")).toBe(true);
  expect(zipBuffer.subarray(0, 2).toString("utf8")).toBe("PK");
  expect(zipBuffer.includes(Buffer.from(tagArchive.root_directory))).toBe(true);
});

test("reuses SHA-based archive cache entries and invalidates moved tag resolutions", async () => {
  const root = tempDir();
  const repositoriesRoot = path.join(root, "repos");
  const cacheRoot = path.join(root, "archive-cache");
  const { logger, rows } = captureLogger();
  const host = createGitHost({
    archive: {
      cache: createFileSystemGitArchiveCache({ rootDir: cacheRoot }),
    },
    logger,
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: `${repositoryId}/workspace` }),
      };
    },
    verbose: true,
  });
  const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Cache\n");
  await host.ensureRepository("demo", {
    actor: { name: "Alice", email: "alice@example.com" },
  });
  await host.createTag("demo", {
    actor: { name: "Alice", email: "alice@example.com" },
    message: "Version 1",
    name: "v1",
    ref: "main",
  });

  const first = await host.readArchive("demo", { format: "zip", ref: "v1" });
  const second = await host.readArchive("demo", { format: "zip", ref: "v1" });

  writeFile(workspace, "CHANGELOG.md", "moved\n");
  gitCommit(workspace, "Move tag target");
  git(["tag", "-f", "v1", "HEAD"], workspace);

  const moved = await host.readArchive("demo", { format: "zip", ref: "v1" });

  expect(first.cache_status).toBe("miss");
  expect(second.cache_status).toBe("hit");
  expect(moved.resolved_commit).not.toBe(first.resolved_commit);
  expect(Buffer.from(moved.content, "base64").equals(Buffer.from(first.content, "base64"))).toBe(false);
  expect(rows.some((entry) => entry.message === "archive cache miss")).toBe(true);
  expect(rows.some((entry) => entry.message === "archive cache hit")).toBe(true);
});

test("supports custom archive filenames, root directories, and link URLs", async () => {
  const root = tempDir();
  const repositoriesRoot = path.join(root, "repos");
  const host = createGitHost({
    archive: {
      buildUrl({ defaultPath, fileName, format, ref, repositoryKey }) {
        return `/downloads/${encodeURIComponent(repositoryKey)}/${format === "zip" ? "z" : "t"}/${encodeURIComponent(ref)}?name=${encodeURIComponent(String(fileName || ""))}&fallback=${encodeURIComponent(defaultPath)}`;
      },
      resolveFileName({ format, ref }) {
        return format === "zip" ? `package-${ref}` : `snapshot-${ref}`;
      },
      resolveRootDirectory({ format, ref }) {
        return format === "zip" ? `zip-root-${ref}` : `tar-root-${ref}`;
      },
    },
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: `${repositoryId}/workspace` }),
      };
    },
  });
  const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Naming\n");
  await host.ensureRepository("demo");

  const zip = await host.readArchive("demo", { format: "zip", ref: "main", repositoryKey: "owner/demo" });
  const tar = await host.resolveArchive("demo", { format: "tar.gz", ref: "main", repositoryKey: "owner/demo" });
  const links = host.resolveArchiveLinks("owner/demo", {
    basePath: "/api/git",
    ref: "main",
    repositoryId: "demo",
  });

  expect(zip.file_name).toBe("package-main.zip");
  expect(zip.root_directory).toBe("zip-root-main/");
  expect(Buffer.from(zip.content, "base64").includes(Buffer.from("zip-root-main/"))).toBe(true);
  expect(tar.file_name).toBe("snapshot-main.tar.gz");
  expect(tar.root_directory).toBe("tar-root-main/");
  expect(links.zip.file_name).toBe("package-main.zip");
  expect(links.tar_gz.file_name).toBe("snapshot-main.tar.gz");
  expect(links.zip.href).toContain("/downloads/owner%2Fdemo/z/main");
  expect(links.tar_gz.href).toContain("/downloads/owner%2Fdemo/t/main");
});
