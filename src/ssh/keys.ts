import { createHash } from "node:crypto";

import { utils as sshUtils } from "ssh2";

import { GitHostError } from "../errors.js";
import { text } from "../utils/text.js";

type GitSshKeyAlgorithm = "ecdsa" | "ed25519" | "rsa";

type GenerateGitSshKeyPairOptions = {
  algorithm?: GitSshKeyAlgorithm;
  bits?: number;
  comment?: string;
};

type GitSshKeyPair = {
  algorithm: GitSshKeyAlgorithm;
  privateKey: string;
  publicKey: string;
};

function normalizeSshPublicKey(value: unknown): string {
  const parts = text(value).split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    throw new GitHostError("git_command_failed", "SSH public key must include a key type and body.");
  }

  return `${parts[0]} ${parts[1]}`;
}

function compareSshPublicKeys(left: unknown, right: unknown): boolean {
  return normalizeSshPublicKey(left) === normalizeSshPublicKey(right);
}

function fingerprintSshPublicKey(value: unknown): string {
  const normalized = normalizeSshPublicKey(value);
  const [, base64Body] = normalized.split(/\s+/);
  const keyData = Buffer.from(text(base64Body), "base64");
  if (!keyData.length) {
    throw new GitHostError("git_command_failed", "SSH public key body is invalid.");
  }

  const digest = createHash("sha256").update(keyData).digest("base64").replace(/=+$/g, "");
  return `SHA256:${digest}`;
}

function generateSshKeyPair(options: GenerateGitSshKeyPairOptions = {}): GitSshKeyPair {
  const algorithm = text(options.algorithm, "ed25519") as GitSshKeyAlgorithm;
  if (algorithm !== "ed25519" && algorithm !== "rsa" && algorithm !== "ecdsa") {
    throw new GitHostError("git_command_failed", `Unsupported SSH key algorithm "${algorithm}".`);
  }

  const generated = sshUtils.generateKeyPairSync(algorithm, {
    bits: algorithm === "rsa" ? Math.max(2048, Number(options.bits) || 4096) : undefined,
    comment: text(options.comment),
  }) as { private: string; public: string };

  return {
    algorithm,
    privateKey: text(generated.private),
    publicKey: text(generated.public),
  };
}

export {
  compareSshPublicKeys,
  fingerprintSshPublicKey,
  generateSshKeyPair,
  normalizeSshPublicKey,
};

export type {
  GenerateGitSshKeyPairOptions,
  GitSshKeyAlgorithm,
  GitSshKeyPair,
};
