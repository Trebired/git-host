import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { createGitHost, resolveRepositoryPath } from "../../src/index.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function tempDir(): string {
  const parent = path.join(os.tmpdir(), "@trebired-git-host");
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, "test_"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeFile(root: string, relativePath: string, content: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

function git(args: string[], cwd?: string): string {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${String(res.stderr || res.stdout || "").trim()}`);
  }

  return String(res.stdout || "").trim();
}

function gitResult(args: string[], cwd?: string) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

async function gitAsync(args: string[], cwd?: string, env?: Record<string, string>): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (Number(code) === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`git ${args.join(" ")} failed: ${String(stderr || stdout).trim()}`));
    });
  });
}

function normalizePublicKey(value: string): string {
  const parts = String(value || "").trim().split(/\s+/);
  return parts.slice(0, 2).join(" ");
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function gitCommit(cwd: string, message: string) {
  git(["add", "-A"], cwd);
  git(["-c", "user.name=Alice", "-c", "user.email=alice@example.com", "commit", "-m", message], cwd);
}

function createHost(rootDir: string) {
  return createGitHost({
    resolveRepository(repositoryId) {
      return {
        id: repositoryId,
        path: resolveRepositoryPath({
          rootDir,
          repositoryPath: `${repositoryId}/workspace`,
        }),
      };
    },
  });
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server.");
  }
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    if (typeof (server as Server & {
      closeAllConnections?: () => void;
      closeIdleConnections?: () => void;
    }).closeIdleConnections === "function") {
      (server as Server & { closeIdleConnections: () => void }).closeIdleConnections();
    }
    if (typeof (server as Server & {
      closeAllConnections?: () => void;
      closeIdleConnections?: () => void;
    }).closeAllConnections === "function") {
      (server as Server & { closeAllConnections: () => void }).closeAllConnections();
    }
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return {
    response,
    json: text ? JSON.parse(text) : null,
  };
}

async function readEventStream(response: Response) {
  if (!response.body) {
    throw new Error("Expected an event stream response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: any }> = [];

  while (true) {
    const chunk = await reader.read();
    const text = chunk.value ? decoder.decode(chunk.value, { stream: !chunk.done }) : "";
    buffer = (buffer + text).replace(/\r\n/g, "\n");

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const lines = block.split("\n");
      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (!line || line.startsWith(":")) continue;
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim() || "message";
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
        }
      }
      if (dataLines.length) {
        events.push({
          data: JSON.parse(dataLines.join("\n")),
          event,
        });
      }
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (chunk.done) break;
  }

  return events;
}

function captureLogger() {
  const rows: Array<{ group: string; level: string; message: string; metadata: unknown }> = [];
  return {
    logger: {
      info(group: string, message: string, metadata?: unknown) {
        rows.push({ level: "info", group, message, metadata });
      },
      warn(group: string, message: string, metadata?: unknown) {
        rows.push({ level: "warn", group, message, metadata });
      },
      error(group: string, message: string, metadata?: unknown) {
        rows.push({ level: "error", group, message, metadata });
      },
      fail(group: string, message: string, metadata?: unknown) {
        rows.push({ level: "fail", group, message, metadata });
      },
    },
    rows,
  };
}

function captureEventSink() {
  const rows: Array<{ group: string; level: string; message: string; metadata?: unknown; timestamp?: string }> = [];
  return {
    logger(event: { group: string; level: string; message: string; metadata?: unknown; timestamp?: string }) {
      rows.push(event);
    },
    rows,
  };
}

export {
  basicAuthHeader,
  captureEventSink,
  captureLogger,
  closeServer,
  createHost,
  createServer,
  fetchJson,
  git,
  gitAsync,
  gitCommit,
  gitResult,
  readEventStream,
  listen,
  normalizePublicKey,
  resolveRepositoryPath,
  sleep,
  tempDir,
  writeFile,
};
