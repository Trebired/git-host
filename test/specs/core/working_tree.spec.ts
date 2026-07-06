import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { createHost, git, gitCommit, resolveRepositoryPath, tempDir, writeFile } from "#cx668v9vcf0v";

const actor = { email: "alice@example.com", name: "Alice" };

function createWorkingTreeFixture() {
  const root = tempDir();
  const repositoriesRoot = path.join(root, "repos");
  const host = createHost(repositoriesRoot);
  const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: "demo/workspace" });
  return { host, workspace };
}

async function expectWorkingTreePath(
  host: ReturnType<typeof createHost>,
  kind: "staged_entries" | "unstaged_entries",
  entryPath: string,
) {
  const tree = await host.readWorkingTree("demo");
  expect(tree[kind].some((entry) => entry.path === entryPath)).toBe(true);
}

async function createReadOpsFixture() {
  const { host, workspace } = createWorkingTreeFixture();
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
  return { host, tag, workspace };
}

test("supports tags, history, blame, search, and archives", async () => {
  const { host, tag } = await createReadOpsFixture();
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
});

test("supports path-scoped compare across branches and deleting tags", async () => {
  const { host, workspace } = await createReadOpsFixture();
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
  const { host, workspace } = createWorkingTreeFixture();

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Hello\n");
  await host.ensureRepository("demo");

  writeFile(workspace, "README.md", "# Hello world\n");
  writeFile(workspace, "notes.txt", "draft\n");

  await expectWorkingTreePath(host, "unstaged_entries", "README.md");
  await host.stagePaths("demo", { paths: ["README.md"] });
  await expectWorkingTreePath(host, "staged_entries", "README.md");
  await host.unstagePaths("demo", { paths: ["README.md"] });
  await expectWorkingTreePath(host, "unstaged_entries", "README.md");

  await host.stagePaths("demo");
  await host.commit("demo", { message: "Update working tree" });
  expect((await host.readSummary("demo")).commits[0].subject).toBe("Update working tree");

  writeFile(workspace, "temp.log", "tmp\n");
  await host.discardPaths("demo", { removeUntracked: true });
  expect(fs.existsSync(path.join(workspace, "temp.log"))).toBe(false);
});

test("reads staged and unstaged file content and checks out explicit refs", async () => {
  const { host, workspace } = createWorkingTreeFixture();

  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Base\n");
  await host.ensureRepository("demo");

  writeFile(workspace, "README.md", "# Staged\n");
  await host.stagePaths("demo", { paths: ["README.md"] });
  writeFile(workspace, "README.md", "# Unstaged\n");

  const staged = await host.readStagedFile("demo", { path: "README.md" });
  const unstaged = await host.readUnstagedFile("demo", { path: "README.md" });
  expect(staged.content).toBe("# Staged\n");
  expect(unstaged.content).toBe("# Unstaged\n");

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

async function createOpsFixture() {
  const root = tempDir();
  const host = createHost(path.join(root, "repos"));
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "demo/workspace" });
  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", "# Ops\n");
  await host.ensureRepository("demo");
  return { host, workspace };
}

test("starts merge and cherry-pick operations", async () => {
  const { host, workspace } = await createOpsFixture();
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
});

test("starts rebase operations", async () => {
  const { host, workspace } = await createOpsFixture();
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
