import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { git, gitAsync, gitCommit, writeFile } from "#cx668v9vcf0v";
import { ACTOR, createActivityFixture, seedActivityRepository } from "./helpers.js";

async function createDemoRelease(
  fixture: ReturnType<typeof createActivityFixture>,
) {
  await fixture.host.createTag("demo", {
    actor: ACTOR,
    message: "Version 1",
    name: "v1",
    ref: "main",
  });

  const createdRelease = await fixture.forge.createRelease("demo", {
    actor: ACTOR,
    existingTagName: "v1",
    notes: "Initial release",
    title: "Version 1",
  });
  await fixture.forge.updateRelease("demo", createdRelease.id, {
    actor: ACTOR,
    notes: "Updated release notes",
  });
  await fixture.forge.deleteRelease("demo", createdRelease.id, {
    actor: ACTOR,
  });
  return createdRelease;
}

async function recordLifecycleSeedActivity(
  fixture: ReturnType<typeof createActivityFixture>,
) {
  await fixture.activity.recordActivity({
    actor_id: "alice",
    actor_label: "Alice",
    created_at: "2026-01-01T00:00:00.000Z",
    kind: "star",
    repository_id: "demo",
    source: "forge",
  });
  await fixture.activity.recordActivity({
    actor_id: "bob",
    actor_label: "Bob",
    created_at: "2026-01-03T00:00:00.000Z",
    kind: "watch",
    repository_id: "demo",
    source: "forge",
  });
  await fixture.activity.recordActivity({
    actor_id: "alice",
    actor_label: "Alice",
    created_at: "2026-01-02T00:00:00.000Z",
    kind: "repository.fetch",
    repository_id: "demo",
    source: "api",
  });
}

async function seedApiActivityRepository(
  fixture: ReturnType<typeof createActivityFixture>,
  remoteRepo: string,
) {
  fs.mkdirSync(path.dirname(remoteRepo), { recursive: true });
  git(["init", "--bare", "--initial-branch", "main", remoteRepo]);
  await fixture.host.ensureRepository("client", {
    cloneUrl: remoteRepo,
    remoteUrl: remoteRepo,
  });
  writeFile(fixture.workspace, "README.md", "# API push\n");
  await fixture.host.stagePaths("client");
  await fixture.host.commit("client", { actor: ACTOR, message: "API update" });
  await fixture.host.push("client", { actor: ACTOR, setUpstream: true });
}

async function pushExternalClientUpdate(remoteRepo: string, externalClone: string) {
  await gitAsync(["clone", remoteRepo, externalClone]);
  writeFile(externalClone, "README.md", "# External update\n");
  gitCommit(externalClone, "External update");
  await gitAsync(["push", "origin", "main"], externalClone);
}

test("records API push, fetch, and pull activity without duplicates", async () => {
  const fixture = createActivityFixture("client");
  const remoteRepo = path.join(fixture.root, "remote", "origin.git");
  const externalClone = path.join(fixture.root, "external-clone");

  await seedApiActivityRepository(fixture, remoteRepo);
  await pushExternalClientUpdate(remoteRepo, externalClone);
  await fixture.host.fetch("client");
  await fixture.host.pull("client", { actor: ACTOR });

  const activityEntries = await fixture.forge.listActivity("client", { source: "api" });
  expect(activityEntries.map((entry) => entry.kind)).toEqual([
    "repository.pull",
    "repository.fetch",
    "repository.push",
  ]);

  const pushEntries = await fixture.forge.listActivity("client", {
    kind: "repository.push",
    source: "api",
  });
  const fetchEntries = await fixture.forge.listActivity("client", {
    kind: "repository.fetch",
    source: "api",
  });
  const pullEntries = await fixture.forge.listActivity("client", {
    kind: "repository.pull",
    source: "api",
  });

  expect(pushEntries).toHaveLength(1);
  expect(fetchEntries).toHaveLength(1);
  expect(pullEntries).toHaveLength(1);
  expect(pushEntries[0]).toMatchObject({ actor_id: "alice", actor_label: "Alice", source: "api" });
  expect(pushEntries[0].metadata).toMatchObject({ branch: "main", remote: "origin", set_upstream: true });
  expect(fetchEntries[0].metadata).toMatchObject({ branch: "main", remote: "origin" });
  expect(pullEntries[0].metadata).toMatchObject({ branch: "main", ff_only: true, remote: "origin" });
}, { timeout: 15_000 });

test("keeps release activity working and returns sorted, filterable activity for empty repositories", async () => {
  const fixture = createActivityFixture();

  expect(await fixture.forge.listActivity("demo")).toEqual([]);
  await seedActivityRepository(fixture, "# Releases\n");
  await recordLifecycleSeedActivity(fixture);
  const createdRelease = await createDemoRelease(fixture);
  const sorted = await fixture.forge.listActivity("demo");
  const manualKinds = sorted
    .filter((entry) => entry.kind === "watch" || entry.kind === "repository.fetch" || entry.kind === "star")
    .map((entry) => entry.kind);

  expect(manualKinds).toEqual(["watch", "repository.fetch", "star"]);

  const forgeOnly = await fixture.forge.listActivity("demo", {
    actor: "alice",
    source: "forge",
  });
  expect(forgeOnly.some((entry) => entry.kind === "release.create")).toBe(true);
  expect(forgeOnly.some((entry) => entry.kind === "release.update")).toBe(true);
  expect(forgeOnly.some((entry) => entry.kind === "release.delete")).toBe(true);

  const releaseCreateEntries = await fixture.forge.listActivity("demo", {
    kind: "release.create",
    source: "forge",
  });
  expect(releaseCreateEntries).toHaveLength(1);
  expect(releaseCreateEntries[0]).toMatchObject({
    actor_id: "alice",
    actor_label: "Alice",
    source: "forge",
  });
  expect(releaseCreateEntries[0].metadata).toMatchObject({
    release_id: createdRelease.id,
    tag_name: "v1",
  });

  const dateFiltered = await fixture.forge.listActivity("demo", {
    createdAfter: "2026-01-02T00:00:00.000Z",
    createdBefore: "2026-01-03T00:00:00.000Z",
  });
  expect(dateFiltered.some((entry) => entry.kind === "repository.fetch")).toBe(true);
  expect(dateFiltered.some((entry) => entry.kind === "star")).toBe(false);
});
