import type { GitBlobEncoding } from "#14021226ec9b";

type DecodedGitContent = {
  content: string;
  encoding: GitBlobEncoding;
  is_binary: boolean;
};

function decodeGitBufferContent(stdout: Buffer): DecodedGitContent {
  if (stdout.includes(0)) {
    return {
      content: stdout.toString("base64"),
      encoding: "base64",
      is_binary: true,
    };
  }

  const utf8 = stdout.toString("utf8");
  if (Buffer.from(utf8, "utf8").equals(stdout)) {
    return {
      content: utf8,
      encoding: "utf8",
      is_binary: false,
    };
  }

  return {
    content: stdout.toString("base64"),
    encoding: "base64",
    is_binary: true,
  };
}

export { decodeGitBufferContent };
export type { DecodedGitContent };
