import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { formatTreeAscii, nestTreeEntries } from "#rfvjfxzebkbs";
import { createHost, gitCommit, resolveRepositoryPath, tempDir, writeFile } from "#cx668v9vcf0v";

function createInspectionFixture(repositoryId = "demo") {
  const root = tempDir();
  const repositoriesRoot = path.join(root, "repos");
  const host = createHost(repositoriesRoot);
  const workspace = resolveRepositoryPath({ rootDir: repositoriesRoot, repositoryPath: `${repositoryId}/workspace` });
  return { host, workspace };
}

function writeInspectionFiles(workspace: string, title: string) {
  fs.mkdirSync(workspace, { recursive: true });
  writeFile(workspace, "README.md", `${title}\n`);
  writeFile(workspace, "data.json", "{\n  \"value\": true\n}\n");
  writeFile(workspace, "src/app.ts", "export const value = 1;\n");
  fs.writeFileSync(path.join(workspace, "logo.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function expectLinguistProgress(progress: string[]) {
  for (const stage of ["queued", "resolving_ref", "listing_tree", "reading_blobs", "analyzing"]) {
    expect(progress).toContain(stage);
  }
  expect(progress[progress.length - 1]).toBe("completed");
}

function expectDecoratedTreeEntries(topTree: Awaited<ReturnType<ReturnType<typeof createHost>["listTree"]>>, recursiveTree: Awaited<ReturnType<ReturnType<typeof createHost>["listTree"]>>) {
  const readmeEntry = topTree.find((entry) => entry.path === "README.md");
  const folderEntry = topTree.find((entry) => entry.path === "src");
  const appEntry = recursiveTree.find((entry) => entry.path === "src/app.ts");
  const logoEntry = recursiveTree.find((entry) => entry.path === "logo.png");

  expect(readmeEntry?.icon?.name).toBe("readme");
  expect(folderEntry?.icon?.name).toBe("folder-src");
  expect(folderEntry?.language).toBeNull();
  expect(appEntry?.language).toBe("TypeScript");
  expect(appEntry?.icon?.name).toBe("typescript");
  expect(Boolean(appEntry?.icon?.svg.includes("<svg"))).toBe(true);
  expect(logoEntry?.language).toBeNull();
  expect(Boolean(logoEntry?.icon?.svg.includes("<svg"))).toBe(true);
}

function expectResolvedCommit(target: Awaited<ReturnType<ReturnType<typeof createHost>["resolveInspectionTarget"]>>, commit: string) {
  expect(target.state).toBe("resolved");
  if (target.state === "resolved") {
    expect(target.commit).toBe(commit);
  }
}

function expectAnalysisProgress(progressPhases: string[], linguistStages: string[]) {
  expect(progressPhases).toContain("resolving_ref");
  expect(progressPhases).toContain("reading_tree");
  expect(progressPhases).toContain("running_linguist");
  expect(progressPhases).toContain("completed");
  expect(linguistStages).toContain("reading_blobs");
}

test("reads linguist results at a ref and enriches tree entries with languages and icons", async () => {
  const { host, workspace } = createInspectionFixture();
  const progress: string[] = [];

  writeInspectionFiles(workspace, "# Linguist");
  const initialSummary = await host.ensureRepository("demo");
  const mainLinguist = await host.readLinguist("demo", {
    onProgress(event) {
      progress.push(event.stage);
    },
    ref: "main",
  });

  expect(mainLinguist.commit).toBe(initialSummary.repository.head_commit);
  expect(mainLinguist.ref).toBe("main");
  expect(mainLinguist.files.results["src/app.ts"]).toBe("TypeScript");
  expect(mainLinguist.files.results["data.json"]).toBe("JSON");
  expect(mainLinguist.files.results["logo.png"]).toBeUndefined();
  expect(mainLinguist.languages.results.TypeScript.type).toBe("programming");
  expect(mainLinguist.languages.results.JSON.type).toBe("data");
  expectLinguistProgress(progress);

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
  expectDecoratedTreeEntries(topTree, recursiveTree);
});

test("resolves inspection targets and returns empty snapshots for unborn repositories", async () => {
  const root = tempDir();
  const host = createHost(path.join(root, "repos"));
  const workspace = resolveRepositoryPath({ rootDir: path.join(root, "repos"), repositoryPath: "empty/workspace" });

  fs.mkdirSync(workspace, { recursive: true });
  await host.ensureRepository("empty");

  const target = await host.resolveInspectionTarget("empty");
  expect(target.state).toBe("empty");
  if (target.state === "empty") {
    expect(target.reason).toBe("unborn");
    expect(target.resolved_ref).toBe("main");
  }

  const tree = await host.readTree("empty", {
    ascii: true,
    linguist: true,
    nested: true,
  });
  expect(tree.empty).toBe(true);
  expect(tree.entries).toHaveLength(0);
  expect(tree.ascii).toBe("");
  expect(tree.nested).toEqual([]);
  expect(tree.linguist && tree.linguist.files.count).toBe(0);

  const file = await host.readFile("empty", {
    path: "README.md",
  });
  expect(file.empty).toBe(true);
  expect(file.blob).toBeNull();
  expect(file.text).toBeNull();

  await expect(host.resolveInspectionTarget("empty", {
    ref: "main",
  })).rejects.toMatchObject({
    code: "repository_unborn",
  });
});

test("reads high-level repository tree snapshots", async () => {
  const { host, workspace } = createInspectionFixture();

  writeInspectionFiles(workspace, "# Snapshot");
  const summary = await host.ensureRepository("demo");
  const target = await host.resolveInspectionTarget("demo", { ref: "main" });
  expectResolvedCommit(target, summary.repository.head_commit);

  const tree = await host.readTree("demo", {
    ascii: true,
    icons: true,
    linguist: true,
    nested: true,
    recursive: true,
  });
  expect(tree.empty).toBe(false);
  expectResolvedCommit(tree.target, summary.repository.head_commit);
  expect(tree.entries.some((entry) => entry.path === "src/app.ts" && entry.language === "TypeScript")).toBe(true);
  expect(tree.entries.some((entry) => entry.path === "README.md" && entry.icon && entry.icon.name === "readme")).toBe(true);
  expect(tree.ascii).toContain("README.md");
  expect(tree.nested && tree.nested.some((entry) => entry.path === "src" && entry.kind === "dir")).toBe(true);
  expect(tree.linguist && tree.linguist.files.results["data.json"]).toBe("JSON");

  const nestedTree = nestTreeEntries(tree.entries);
  expect(nestedTree.some((entry) => entry.path === "src" && entry.kind === "dir")).toBe(true);
  expect(formatTreeAscii(nestedTree)).toContain("src");
});

test("reads repository directory and file snapshots", async () => {
  const { host, workspace } = createInspectionFixture();
  writeInspectionFiles(workspace, "# Snapshot");
  await host.ensureRepository("demo");

  const directory = await host.readDirectory("demo", {
    icons: true,
    includeLineCounts: true,
    linguist: true,
    path: "src",
  });
  expect(directory.kind).toBe("dir");
  if (directory.kind === "dir") {
    expect(directory.entries).toHaveLength(1);
    expect(directory.entries[0].path).toBe("src/app.ts");
    expect(directory.entries[0].language).toBe("TypeScript");
    expect((directory.entries[0].line_count || 0) > 0).toBe(true);
  }

  const filePointer = await host.readDirectory("demo", {
    icons: true,
    includeLineCounts: true,
    linguist: true,
    path: "README.md",
  });
  expect(filePointer.kind).toBe("file");
  if (filePointer.kind === "file") {
    expect(filePointer.entry.path).toBe("README.md");
    expect(filePointer.entry.kind).toBe("file");
    expect((filePointer.entry.line_count || 0) > 0).toBe(true);
  }

  const file = await host.readFile("demo", {
    includeIcon: true,
    includeLanguage: true,
    path: "src/app.ts",
  });
  expect(file.empty).toBe(false);
  expect(file.language).toBe("TypeScript");
  expect(file.icon && file.icon.name).toBe("typescript");
  expect(file.text).toContain("export const value = 1;");
  expect((file.line_count || 0) > 0).toBe(true);
});

test("reads coordinated repository analysis progress", async () => {
  const { host, workspace } = createInspectionFixture();
  const progressPhases: string[] = [];
  const linguistStages: string[] = [];

  writeInspectionFiles(workspace, "# Snapshot");
  await host.ensureRepository("demo");

  const analysis = await host.readRepositoryAnalysis("demo", {
    ascii: true,
    icons: true,
    nested: true,
    onLinguistProgress(event) {
      linguistStages.push(event.stage);
    },
    onProgress(event) {
      progressPhases.push(event.phase);
    },
  });
  expect(analysis.empty).toBe(false);
  expect(analysis.linguist.files.results["src/app.ts"]).toBe("TypeScript");
  expect(analysis.tree.entries.some((entry) => entry.path === "logo.png")).toBe(true);
  expectAnalysisProgress(progressPhases, linguistStages);

  await expect(host.readTree("demo", {
    path: "missing.txt",
  })).rejects.toMatchObject({
    code: "path_not_found",
  });
});
