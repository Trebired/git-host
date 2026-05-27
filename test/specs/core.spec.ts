import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { createGitHost } from "../../src/index.js";
import {
  captureEventSink,
  captureLogger,
  createHost,
  git,
  gitCommit,
  resolveRepositoryPath,
  tempDir,
  writeFile,
} from "./helpers.js";

describe("@trebired/git-host", () => {
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

    expect(rows.some((entry) => entry.level === "info" && entry.group === "git-host" && entry.message === "initializing repository")).toBe(true);
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

    expect(rows.some((entry) => entry.level === "info" && entry.group === "git-host" && entry.message === "initializing repository")).toBe(true);
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

  test("reads linguist results at a ref and enriches tree entries with languages and icons", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Linguist\n");
    writeFile(workspace, "data.json", "{\n  \"value\": true\n}\n");
    writeFile(workspace, "src/app.ts", "export const value = 1;\n");
    fs.writeFileSync(path.join(workspace, "logo.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const initialSummary = await host.ensureRepository("demo");
    const mainLinguist = await host.readLinguist("demo", { ref: "main" });

    expect(mainLinguist.commit).toBe(initialSummary.repository.head_commit);
    expect(mainLinguist.ref).toBe("main");
    expect(mainLinguist.files.results["src/app.ts"]).toBe("TypeScript");
    expect(mainLinguist.files.results["data.json"]).toBe("JSON");
    expect(mainLinguist.files.results["logo.png"]).toBeUndefined();
    expect(mainLinguist.languages.results.TypeScript.type).toBe("programming");
    expect(mainLinguist.languages.results.JSON.type).toBe("data");

    await host.createBranch("demo", { name: "feature/linguist", checkout: true });
    writeFile(workspace, "script.py", "print('hello')\n");
    gitCommit(workspace, "Add python script");

    const featureLinguist = await host.readLinguist("demo", { ref: "feature/linguist" });
    expect(featureLinguist.files.results["script.py"]).toBe("Python");
    expect(featureLinguist.languages.results.Python.type).toBe("programming");
    expect(mainLinguist.languages.results.Python).toBeUndefined();

    const topTree = await host.listTree("demo", {
      icons: true,
      linguist: true,
      ref: "feature/linguist",
    });
    const recursiveTree = await host.listTree("demo", {
      icons: true,
      linguist: true,
      recursive: true,
      ref: "feature/linguist",
    });

    const readmeEntry = topTree.find((entry) => entry.path === "README.md");
    const folderEntry = topTree.find((entry) => entry.path === "src");
    const appEntry = recursiveTree.find((entry) => entry.path === "src/app.ts");
    const logoEntry = recursiveTree.find((entry) => entry.path === "logo.png");

    expect(readmeEntry && readmeEntry.icon && readmeEntry.icon.name).toBe("readme");
    expect(folderEntry && folderEntry.icon && folderEntry.icon.name).toBe("folder-src");
    expect(folderEntry && folderEntry.language).toBeNull();
    expect(appEntry && appEntry.language).toBe("TypeScript");
    expect(appEntry && appEntry.icon && appEntry.icon.name).toBe("typescript");
    expect(Boolean(appEntry && appEntry.icon && appEntry.icon.svg.includes("<svg"))).toBe(true);
    expect(logoEntry && logoEntry.language).toBeNull();
    expect(Boolean(logoEntry && logoEntry.icon && logoEntry.icon.svg.includes("<svg"))).toBe(true);
  });

  test("supports tags, path-scoped history and compare, blame, search, and archives", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
    const actor = { name: "Alice", email: "alice@example.com" };

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Start\n");
    writeFile(workspace, "src/app.ts", "export const value = 1;\n");
    await host.ensureRepository("demo", { actor });

    writeFile(workspace, "README.md", "# Updated\n");
    await host.stagePaths("demo");
    await host.commit("demo", { actor, message: "Update readme" });

    writeFile(workspace, "src/app.ts", "export const value = 2;\n");
    await host.stagePaths("demo");
    await host.commit("demo", { actor, message: "Update app" });

    const tag = await host.createTag("demo", {
      actor,
      message: "Release v1",
      name: "v1",
      ref: "main",
    });
    await host.createTag("demo", { name: "latest", ref: "HEAD" });

    const tags = await host.listTags("demo");
    expect(tags.some((entry) => entry.name === "v1" && entry.annotated)).toBe(true);
    expect(tags.some((entry) => entry.name === "latest" && entry.annotated === false)).toBe(true);
    expect(tag.message).toBe("Release v1");
    expect((await host.readTag("demo", "v1")).target_type).toBe("commit");

    const readmeHistory = await host.listCommits("demo", { path: "README.md", ref: "main", limit: 10 });
    expect(readmeHistory[0].subject).toBe("Update readme");
    expect(readmeHistory.some((entry) => entry.subject === "Update app")).toBe(false);

    const blame = await host.readBlame("demo", { path: "src/app.ts", ref: "main" });
    expect(blame.lines[0].author_name).toBe("Alice");
    expect(blame.lines[0].content).toBe("export const value = 2;");

    const search = await host.search("demo", { path: "src", query: "value", ref: "main" });
    expect(search.match_count).toBe(1);
    expect(search.files[0].path).toBe("src/app.ts");
    expect(search.files[0].matches[0].line).toContain("value");

    const archive = await host.readArchive("demo", { format: "zip", ref: "main" });
    expect(archive.file_name.endsWith(".zip")).toBe(true);
    expect(Buffer.from(archive.content, "base64").subarray(0, 2).toString("utf8")).toBe("PK");

    await host.createBranch("demo", { name: "feature/path", checkout: true });
    writeFile(workspace, "README.md", "# Path branch\n");
    writeFile(workspace, "src/app.ts", "export const value = 3;\n");
    await host.stagePaths("demo");
    await host.commit("demo", { actor, message: "Path scoped change" });

    await host.checkoutBranch("demo", { name: "main" });
    const compare = await host.diff("demo", { baseRef: "main", headRef: "feature/path", path: "src" });
    expect(compare.files).toHaveLength(1);
    expect(compare.files[0].path).toBe("src/app.ts");
    expect(compare.commits[0].subject).toBe("Path scoped change");

    await host.deleteTag("demo", { name: "latest" });
    expect((await host.listTags("demo")).some((entry) => entry.name === "latest")).toBe(false);
  });

  test("reads the working tree, stages and unstages paths, commits, and discards untracked files", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Hello\n");
    await host.ensureRepository("demo");

    writeFile(workspace, "README.md", "# Hello world\n");
    writeFile(workspace, "notes.txt", "draft\n");

    expect((await host.readWorkingTree("demo")).unstaged_entries.some((entry) => entry.path === "README.md")).toBe(true);
    await host.stagePaths("demo", { paths: ["README.md"] });
    expect((await host.readWorkingTree("demo")).staged_entries.some((entry) => entry.path === "README.md")).toBe(true);
    await host.unstagePaths("demo", { paths: ["README.md"] });
    expect((await host.readWorkingTree("demo")).unstaged_entries.some((entry) => entry.path === "README.md")).toBe(true);

    await host.stagePaths("demo");
    await host.commit("demo", { message: "Update working tree" });
    expect((await host.readSummary("demo")).commits[0].subject).toBe("Update working tree");

    writeFile(workspace, "temp.log", "tmp\n");
    await host.discardPaths("demo", { removeUntracked: true });
    expect(fs.existsSync(path.join(workspace, "temp.log"))).toBe(false);
  });

  test("reads staged and unstaged file content and checks out explicit refs", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Base\n");
    await host.ensureRepository("demo");

    writeFile(workspace, "README.md", "# Staged\n");
    await host.stagePaths("demo", { paths: ["README.md"] });
    writeFile(workspace, "README.md", "# Unstaged\n");

    expect((await host.readStagedFile("demo", { path: "README.md" })).content).toBe("# Staged\n");
    expect((await host.readUnstagedFile("demo", { path: "README.md" })).content).toBe("# Unstaged\n");

    await host.stagePaths("demo");
    await host.commit("demo", { message: "Staged change" });
    const committedSummary = await host.readSummary("demo");

    await host.createBranch("demo", { name: "feature/ref", checkout: true });
    writeFile(workspace, "README.md", "# Detached target\n");
    await host.stagePaths("demo");
    await host.commit("demo", { message: "Detached target commit" });
    const detachedTarget = await host.readSummary("demo");

    await host.checkoutRef("demo", { detach: true, ref: committedSummary.repository.head_commit });
    expect((await host.readSummary("demo")).repository.current_branch).toBe("HEAD");

    await host.checkoutRef("demo", { ref: "feature/ref" });
    const featureSummary = await host.readSummary("demo");
    expect(featureSummary.repository.head_commit).toBe(detachedTarget.repository.head_commit);
    expect(fs.readFileSync(path.join(workspace, "README.md"), "utf8")).toBe("# Detached target\n");
  });

  test("fetches and pulls from a configured remote", async () => {
    const root = tempDir();
    const remoteRepo = path.join(root, "remote", "origin.git");
    const sourceRepo = path.join(root, "source", "source");

    fs.mkdirSync(path.dirname(remoteRepo), { recursive: true });
    fs.mkdirSync(path.dirname(sourceRepo), { recursive: true });
    git(["init", "--bare", "--initial-branch", "main", remoteRepo]);
    git(["clone", remoteRepo, sourceRepo]);
    writeFile(sourceRepo, "README.md", "# Seed\n");
    gitCommit(sourceRepo, "Seed commit");
    git(["push", "origin", "main"], sourceRepo);

    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
    await host.ensureRepository("demo", { cloneUrl: remoteRepo, remoteUrl: remoteRepo });

    const externalClone = path.join(root, "external");
    git(["clone", remoteRepo, externalClone]);
    writeFile(externalClone, "README.md", "# Seed v2\n");
    gitCommit(externalClone, "Remote update");
    git(["push", "origin", "main"], externalClone);

    await host.fetch("demo");
    expect((await host.diff("demo", { baseRef: "main", headRef: "origin/main" })).commits[0].subject).toBe("Remote update");
    await host.pull("demo");
    expect(fs.readFileSync(path.join(workspace, "README.md"), "utf8")).toBe("# Seed v2\n");
  });

  test("starts merge, cherry-pick, and rebase operations", async () => {
    const root = tempDir();
    const host = createHost(path.join(root, "repos"));
    const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });

    fs.mkdirSync(workspace, { recursive: true });
    writeFile(workspace, "README.md", "# Ops\n");
    await host.ensureRepository("demo");

    await host.createBranch("demo", { name: "feature/merge", checkout: true });
    writeFile(workspace, "merge.txt", "feature branch\n");
    await host.stagePaths("demo");
    await host.commit("demo", { message: "Feature merge commit" });

    await host.checkoutBranch("demo", { name: "main" });
    writeFile(workspace, "main.txt", "main branch\n");
    await host.stagePaths("demo");
    await host.commit("demo", { message: "Main branch commit" });

    const merged = await host.merge("demo", {
      actor: { name: "Alice", email: "alice@example.com" },
      ref: "feature/merge",
    });
    expect(merged.commits[0].subject.includes("Merge branch")).toBe(true);
    expect(fs.existsSync(path.join(workspace, "merge.txt"))).toBe(true);

    await host.createBranch("demo", { name: "feature/pick", checkout: true });
    writeFile(workspace, "pick.txt", "pick me\n");
    await host.stagePaths("demo");
    await host.commit("demo", { message: "Pick commit" });
    const pickSummary = await host.readSummary("demo");

    await host.checkoutBranch("demo", { name: "main" });
    const picked = await host.cherryPick("demo", { refs: pickSummary.repository.head_commit });
    expect(picked.commits[0].subject).toBe("Pick commit");
    expect(fs.readFileSync(path.join(workspace, "pick.txt"), "utf8")).toBe("pick me\n");

    await host.createBranch("demo", { name: "feature/rebase", checkout: true });
    writeFile(workspace, "rebase.txt", "feature rebase\n");
    await host.stagePaths("demo");
    await host.commit("demo", { message: "Feature rebase commit" });

    await host.checkoutBranch("demo", { name: "main" });
    writeFile(workspace, "main-late.txt", "late main\n");
    await host.stagePaths("demo");
    await host.commit("demo", { message: "Main late commit" });

    await host.checkoutBranch("demo", { name: "feature/rebase" });
    const rebased = await host.rebase("demo", { ref: "main" });
    expect(rebased.repository.current_branch).toBe("feature/rebase");
    expect(rebased.commits[0].subject).toBe("Feature rebase commit");
    expect(rebased.commits.some((entry) => entry.subject === "Main late commit")).toBe(true);
    expect(fs.readFileSync(path.join(workspace, "rebase.txt"), "utf8")).toBe("feature rebase\n");
  });
});
