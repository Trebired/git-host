import { spawn } from "node:child_process";

import type { GitCommandBufferResult, GitCommandResult } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";

function spawnGitProcess(args: string[], options: { cwd: string; env?: Record<string, string> }) {
  return spawn("git", Array.isArray(args) ? args : [], {
    cwd: text(options.cwd),
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function resolveSpawnFailure(error: any) {
  return error && error.message ? String(error.message) : "Failed to start git.";
}

function appendGitError(current: string, error: any) {
  return `${current}${error && error.message ? String(error.message) : "Git command failed."}`;
}

async function runGit(
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    stdinText?: string;
  },
): Promise<GitCommandResult> {
  const stdinText = typeof options.stdinText === "string" ? options.stdinText : "";

  return await new Promise<GitCommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawnGitProcess(args, options);
    } catch (error: any) {
      resolve({
        code: -1,
        ok: false,
        stderr: resolveSpawnFailure(error),
        stdout: "",
      });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error: any) => {
      stderr = appendGitError(stderr, error);
    });
    child.on("close", (code) => {
      resolve({
        code: Number(code) || 0,
        ok: Number(code) === 0,
        stderr,
        stdout,
      });
    });

    if (stdinText) child.stdin.write(stdinText);
    child.stdin.end();
  });
}

async function runGitBuffer(
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    stdin?: Buffer;
  },
): Promise<GitCommandBufferResult> {
  const stdin = Buffer.isBuffer(options.stdin) ? options.stdin : null;

  return await new Promise<GitCommandBufferResult>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawnGitProcess(args, options);
    } catch (error: any) {
      resolve({
        code: -1,
        ok: false,
        stderr: resolveSpawnFailure(error),
        stdout: Buffer.alloc(0),
      });
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error: any) => {
      stderr = appendGitError(stderr, error);
    });
    child.on("close", (code) => {
      resolve({
        code: Number(code) || 0,
        ok: Number(code) === 0,
        stderr,
        stdout: Buffer.concat(stdoutChunks),
      });
    });

    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

export { runGit, runGitBuffer };
