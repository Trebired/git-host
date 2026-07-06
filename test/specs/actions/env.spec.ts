import { expect, test } from "bun:test";

import {
  actor,
  bubblewrapWorks,
  createActionsFixture,
  createBubblewrapSandbox,
  fs,
  path,
  runProbeWorkflow,
  tempDir,
  waitForRun,
  workflowDefinitionId,
  writeFile,
  writeWorkflowFile,
} from "./helpers.js";

function createPublishFixture() {
  const fixture = createActionsFixture("demo", {
    resolveExecutionContext() {
      return {
        env: {
          TOP: "host",
        },
        secrets: {
          PUBLISH_TOKEN: "super-secret-token",
        },
      };
    },
  });
  fs.mkdirSync(fixture.workspace, { recursive: true });
  writeWorkflowFile(fixture.workspace, "publish.yml", `
name: Publish
on:
  workflow_dispatch:
    inputs:
      target:
        type: string
        required: true
      dry_run:
        type: boolean
        default: false
env:
  TOP: workflow
jobs:
  publish:
    runs-on: ubuntu-latest
    env:
      LEVEL: \${{ env.TOP }}-job
    steps:
      - name: Echo values
        env:
          STEP_LEVEL: \${{ env.LEVEL }}-step
        run: |
          printf '%s\\n' "\${TOP}"
          printf '%s\\n' "\${LEVEL}"
          printf '%s\\n' "\${STEP_LEVEL}"
          printf '%s\\n' "\${PUBLISH_TOKEN}"
          printf '%s\\n' "\${EXTRA_SECRET}"
          printf '%s\\n' "\${{ github.event_name }}"
          printf '%s\\n' "\${{ github.event.inputs.target }}"
          printf '%s\\n' "\${{ github.event.inputs.dry_run }}"
`, ".git-host");
  writeFile(fixture.workspace, "README.md", "# Publish\n");
  return fixture;
}

async function expectPublishWorkflowMetadata(fixture: ReturnType<typeof createPublishFixture>) {
  const workflow = await fixture.forge.readWorkflow("demo", workflowDefinitionId("publish.yml"));
  expect(workflow.schema).toBe("gha-subset-v1");
  expect(workflow.jobs).toHaveLength(1);
  expect(workflow.on?.workflow_dispatch?.inputs?.map((entry) => entry.name)).toEqual(["target", "dry_run"]);
}

function expectSecretRedaction(events: Awaited<ReturnType<ReturnType<typeof createPublishFixture>["forge"]["listWorkflowRunEvents"]>>) {
  for (const chunk of ["workflow", "workflow-job", "workflow-job-step", "workflow_dispatch", "pkg-a", "true", "***"]) {
    expect(events.some((event) => String(event.chunk || "").includes(chunk))).toBe(true);
  }
  expect(events.some((event) => String(event.chunk || "").includes("super-secret-token"))).toBe(false);
  expect(events.some((event) => String(event.chunk || "").includes("other-secret-token"))).toBe(false);
}

test("normalizes github-actions-inspired workflows, validates dispatch inputs, merges env in order, and redacts secrets", async () => {
  const fixture = createPublishFixture();
  await fixture.host.ensureRepository("demo", { actor });
  await expectPublishWorkflowMetadata(fixture);

  await expect(fixture.forge.runWorkflow("demo", workflowDefinitionId("publish.yml"), {
    actor,
    ref: "HEAD",
  })).rejects.toThrow(/target/i);

  const run = await fixture.forge.runWorkflow("demo", workflowDefinitionId("publish.yml"), {
    actor,
    inputs: {
      dry_run: true,
      target: "pkg-a",
    },
    ref: "HEAD",
    secrets: {
      EXTRA_SECRET: "other-secret-token",
    },
  });
  const completed = await waitForRun(fixture.forge, "demo", run.id);
  const events = await fixture.forge.listWorkflowRunEvents("demo", run.id);

  expect(completed.status).toBe("success");
  expect(completed.trigger_context?.inputs).toEqual({
    dry_run: true,
    target: "pkg-a",
  });
  expectSecretRedaction(events);
}, { timeout: 20_000 });

test("does not leak the host process environment into workflow steps by default", async () => {
  process.env.HOSTLEAK_SENTINEL = "should-not-be-visible";
  try {
    const { completed, output } = await runProbeWorkflow({
      script: [
        `printf 'sentinel=%s\\n' "\${HOSTLEAK_SENTINEL:-<unset>}"`,
        `printf 'path=%s\\n' "\${PATH:+present}"`,
        `printf 'home=%s\\n' "\${HOME:+present}"`,
      ],
    });
    expect(completed.status).toBe("success");
    expect(output).toContain("sentinel=<unset>");
    expect(output).not.toContain("should-not-be-visible");
    expect(output).toContain("path=present");
    expect(output).toContain("home=present");
  } finally {
    delete process.env.HOSTLEAK_SENTINEL;
  }
}, { timeout: 20_000 });

test("exposes only allowlisted process env keys via environment.passthrough", async () => {
  process.env.HOSTLEAK_ALLOWED = "allowed-value";
  process.env.HOSTLEAK_HIDDEN = "hidden-value";
  try {
    const { completed, output } = await runProbeWorkflow({
      actions: {
        environment: {
          passthrough: ["HOSTLEAK_ALLOWED"],
        },
      },
      script: [
        `printf 'allowed=%s\\n' "\${HOSTLEAK_ALLOWED:-<unset>}"`,
        `printf 'hidden=%s\\n' "\${HOSTLEAK_HIDDEN:-<unset>}"`,
      ],
    });
    expect(completed.status).toBe("success");
    expect(output).toContain("allowed=allowed-value");
    expect(output).toContain("hidden=<unset>");
    expect(output).not.toContain("hidden-value");
  } finally {
    delete process.env.HOSTLEAK_ALLOWED;
    delete process.env.HOSTLEAK_HIDDEN;
  }
}, { timeout: 20_000 });

test("restores full host env inheritance with environment.inheritProcessEnv", async () => {
  process.env.HOSTLEAK_SENTINEL = "should-be-visible-when-opted-in";
  try {
    const { completed, output } = await runProbeWorkflow({
      actions: {
        environment: {
          inheritProcessEnv: true,
        },
      },
      script: [
        `printf 'sentinel=%s\\n' "\${HOSTLEAK_SENTINEL:-<unset>}"`,
      ],
    });
    expect(completed.status).toBe("success");
    expect(output).toContain("sentinel=should-be-visible-when-opted-in");
  } finally {
    delete process.env.HOSTLEAK_SENTINEL;
  }
}, { timeout: 20_000 });

test("redacts declared secrets and environment.sensitiveKeys from streamed output", async () => {
  const { completed, events, output } = await runProbeWorkflow({
    actions: {
      env: {
        DEPLOY_KEY: "top-secret-deploy-key",
      },
      environment: {
        sensitiveKeys: ["DEPLOY_KEY"],
      },
    },
    runInput: {
      actor,
      ref: "HEAD",
      secrets: {
        RUN_SECRET: "run-scoped-secret",
      },
    },
    script: [
      `printf 'secret=%s\\n' "\${RUN_SECRET}"`,
      `printf 'key=%s\\n' "\${DEPLOY_KEY}"`,
    ],
  });
  expect(completed.status).toBe("success");
  expect(output).toContain("***");
  expect(events.some((event) => String(event.chunk || "").includes("run-scoped-secret"))).toBe(false);
  expect(events.some((event) => String(event.chunk || "").includes("top-secret-deploy-key"))).toBe(false);
}, { timeout: 20_000 });

test("createBubblewrapSandbox wraps the step shell in a bwrap invocation", () => {
  const beforeSpawn = createBubblewrapSandbox();
  const spec = beforeSpawn({
    args: ["-lc", "echo hi"],
    command: "bash",
    cwd: "/work/space",
    env: { PATH: "/usr/bin" },
  });
  expect(spec.command).toBe("bwrap");
  expect(spec.args).toContain("--unshare-all");
  expect(spec.args).not.toContain("--share-net");
  expect(spec.args.join(" ")).toContain("--bind /work/space /work/space");
  expect(spec.args.slice(-4)).toEqual(["--", "bash", "-lc", "echo hi"]);

  const networked = createBubblewrapSandbox({ allowNetwork: true })({
    args: ["-lc", "echo hi"],
    command: "bash",
    cwd: "/work/space",
    env: {},
  });
  expect(networked.args).toContain("--share-net");
});

const sandboxTest = bubblewrapWorks() ? test : test.skip;
sandboxTest("runs steps inside a bubblewrap sandbox that hides host files from the step", async () => {
  const secretDir = tempDir();
  const secretFile = path.join(secretDir, "host-secret.txt");
  fs.writeFileSync(secretFile, "sandbox-should-hide-this\n");

  const { completed, output } = await runProbeWorkflow({
    actions: {
      localRunner: {
        beforeSpawn: createBubblewrapSandbox(),
      },
    },
    script: [
      `printf 'inside=%s\\n' "sandbox-ok"`,
      `if cat ${secretFile} 2>/dev/null; then printf 'leaked\\n'; else printf 'blocked\\n'; fi`,
    ],
  });

  expect(completed.status).toBe("success");
  expect(output).toContain("inside=sandbox-ok");
  expect(output).toContain("blocked");
  expect(output).not.toContain("sandbox-should-hide-this");
}, { timeout: 20_000 });
