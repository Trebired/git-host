import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { GitHostError } from "#ebw9yuqcyi9w";
import type { GitRepositoryHandle, GitSourceArchiveFormat } from "#1mbdfxwwqqpa";
import { createArchiveGenerationError } from "./commit.js";

function createArchiveOutput(child: ReturnType<typeof spawn>, format: GitSourceArchiveFormat) {
  return format === "zip" ? child.stdout : child.stdout.pipe(createGzip());
}

function attachArchiveCompletion(
  repository: GitRepositoryHandle,
  input: { format: GitSourceArchiveFormat; ref: string },
  output: NodeJS.ReadableStream,
  child: ReturnType<typeof spawn>,
  stderrRef: { value: string },
) {
  return new Promise<void>((resolve, reject) => {
    let gitDone = false;
    let streamDone = false;
    let settled = false;

    const maybeResolve = () => {
      if (!settled && gitDone && streamDone) {
        settled = true;
        resolve();
      }
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof GitHostError
        ? error
        : createArchiveGenerationError(repository, input.ref, input.format, stderrRef.value || (error instanceof Error ? error.message : "")));
    };

    child.on("error", fail);
    child.on("close", (code) => {
      if (Number(code) !== 0) return fail(createArchiveGenerationError(repository, input.ref, input.format, stderrRef.value));
      gitDone = true;
      maybeResolve();
    });
    void finished(output).then(() => {
      streamDone = true;
      maybeResolve();
    }).catch(fail);
  });
}

function spawnArchiveStream(
  repository: GitRepositoryHandle,
  input: { format: GitSourceArchiveFormat; ref: string; rootDirectory: string },
): { completed: Promise<void>; stream: NodeJS.ReadableStream } {
  const child = spawn("git", [
    "archive",
    input.format === "zip" ? "--format=zip" : "--format=tar",
    `--prefix=${input.rootDirectory}`,
    input.ref,
  ], {
    cwd: repository.path,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = createArchiveOutput(child, input.format);
  const stderrRef = { value: "" };
  child.stderr.on("data", (chunk) => {
    stderrRef.value += String(chunk);
  });
  return {
    completed: attachArchiveCompletion(repository, input, output, child, stderrRef),
    stream: output,
  };
}

export { spawnArchiveStream };
