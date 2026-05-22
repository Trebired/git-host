import { spawn } from "node:child_process";

import type { GitCommandBufferResult, GitCommandResult } from "../../types.js";
import { text } from "../../utils/text.js";

async function runGit(
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    stdinText?: string;
  },
): Promise<GitCommandResult> {
  const cwd = text(options.cwd);
  const env = options.env;
  const stdinText = typeof options.stdinText === "string" ? options.stdinText : "";

  return await new Promise<GitCommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", Array.isArray(args) ? args : [], {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error: any) {
      resolve({
        code: -1,
        ok: false,
        stderr: error && error.message ? String(error.message) : "Failed to start git.",
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
      stderr += error && error.message ? String(error.message) : "Git command failed.";
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
  const cwd = text(options.cwd);
  const env = options.env;
  const stdin = Buffer.isBuffer(options.stdin) ? options.stdin : null;

  return await new Promise<GitCommandBufferResult>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", Array.isArray(args) ? args : [], {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error: any) {
      resolve({
        code: -1,
        ok: false,
        stderr: error && error.message ? String(error.message) : "Failed to start git.",
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
      stderr += error && error.message ? String(error.message) : "Git command failed.";
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
