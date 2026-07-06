import { expect, test } from "bun:test";
import path from "node:path";

import { closeServer, gitAsync, gitCommit, listen, sleep, writeFile } from "#cx668v9vcf0v";
import {
  createActivityFixture,
  createActivitySshServer,
  createAuthenticatedActivityHttpServer,
  expectRecordedPush,
  seedActivityRepository,
  writeClientPrivateKey,
} from "./helpers.js";

test("records HTTP push activity through the transport audit hook", async () => {
  const fixture = createActivityFixture();
  const username = "alice";
  const password = "secret";

  await seedActivityRepository(fixture, "# Hosted HTTP\n");

  const server = createAuthenticatedActivityHttpServer(
    fixture.workspace,
    username,
    password,
    fixture.activity,
  );
  const port = await listen(server);
  const clientRepo = path.join(fixture.root, "http-client");
  const remoteUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/git/demo.git`;

  try {
    await gitAsync(["clone", remoteUrl, clientRepo]);
    writeFile(clientRepo, "README.md", "# Hosted HTTP v2\n");
    gitCommit(clientRepo, "HTTP update");
    await gitAsync(["push", "origin", "main"], clientRepo);
    await sleep(20);

    const { entry, pushEntries } = await expectRecordedPush(fixture.forge, "demo", "http");
    expect(pushEntries).toHaveLength(1);
    expect(entry).toMatchObject({
      actor_id: "alice",
      actor_label: "Alice",
      kind: "repository.push",
      repository_id: "demo",
      source: "http",
    });
    expect(entry?.metadata).toMatchObject({
      branch: "main",
      remote_user: "alice",
      service: "git-receive-pack",
      transport: "http",
    });
  } finally {
    await closeServer(server);
  }
}, { timeout: 15_000 });

test("records SSH push activity through the transport audit hook", async () => {
  const fixture = createActivityFixture();

  await seedActivityRepository(fixture, "# Hosted SSH\n");

  const clientKeyPath = writeClientPrivateKey(fixture.root);
  const sshServer: any = createActivitySshServer(fixture.workspace, fixture.activity);
  const port = await listen(sshServer);
  const sshCommand = `ssh -i ${clientKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes -o LogLevel=ERROR -p ${port}`;
  const clientRepo = path.join(fixture.root, "ssh-client");

  try {
    await gitAsync(["clone", `ssh://git@127.0.0.1:${port}/demo.git`, clientRepo], undefined, { GIT_SSH_COMMAND: sshCommand });
    writeFile(clientRepo, "README.md", "# Hosted SSH v2\n");
    gitCommit(clientRepo, "SSH update");
    await gitAsync(["push", "origin", "main"], clientRepo, { GIT_SSH_COMMAND: sshCommand });
    await sleep(20);

    const { entry, pushEntries } = await expectRecordedPush(fixture.forge, "demo", "ssh");
    expect(pushEntries).toHaveLength(1);
    expect(entry).toMatchObject({
      actor_id: "git-test-client",
      actor_label: "SSH Client",
      kind: "repository.push",
      source: "ssh",
    });
    expect(entry?.metadata).toMatchObject({
      branch: "main",
      remote_user: "git-test-client",
      service: "git-receive-pack",
      transport: "ssh",
      username: "git",
    });
  } finally {
    await closeServer(sshServer);
  }
}, { timeout: 15_000 });
