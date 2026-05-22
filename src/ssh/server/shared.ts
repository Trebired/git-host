import { GitHostError } from "../../errors.js";
import type {
  CreateGitSshServerOptions,
  GitSshAuthenticationResult,
  GitSshAuthorizationResult,
  GitSshResolvedRepository,
  GitSshService,
} from "../../types.js";
import { assertAbsoluteRepositoryPath } from "../../utils/paths.js";
import { text } from "../../utils/text.js";

type ParsedGitSshCommand = {
  command: string;
  repositoryKey: string;
  service: GitSshService;
  wantsWrite: boolean;
};

type NormalizedSshAuthenticationResult = {
  identity: GitSshAuthenticationResult["identity"];
  publicKey: string;
  remoteUser: string;
};

function normalizeBasePath(value: unknown): string {
  return text(value).replace(/^\/+|\/+$/g, "");
}

function parseGitSshCommand(commandInput: unknown, basePathInput: unknown = ""): ParsedGitSshCommand | null {
  const command = text(commandInput);
  const match = command.match(/^(git-upload-pack|git-receive-pack)\s+['"]?(.+?)['"]?$/);
  if (!match) return null;

  const service = text(match[1]) as GitSshService;
  const wantsWrite = service === "git-receive-pack";
  const basePath = normalizeBasePath(basePathInput);

  let rawTarget = text(match[2]).replace(/^\/+/, "");
  if (basePath) {
    if (rawTarget === basePath) rawTarget = "";
    else if (rawTarget.startsWith(`${basePath}/`)) rawTarget = rawTarget.slice(basePath.length + 1);
  }
  if (!rawTarget.endsWith(".git")) return null;

  const repositoryPath = rawTarget.slice(0, -4);
  let repositoryKey = "";
  try {
    repositoryKey = decodeURIComponent(repositoryPath);
  } catch {
    return null;
  }

  if (!repositoryKey) return null;
  return { command, repositoryKey, service, wantsWrite };
}

function writeGitSshFailure(channel: any, messageInput: unknown) {
  const message = `${text(messageInput, "Git SSH request failed.")}\n`;
  try { channel.stderr.write(message); } catch {}
  try { channel.exit(1); } catch {}
  try { channel.close(); } catch {}
}

function normalizeAuthenticationResult(result: GitSshAuthenticationResult): NormalizedSshAuthenticationResult | null {
  if (!result || !text(result.publicKey)) return null;
  return {
    identity: result.identity,
    publicKey: text(result.publicKey),
    remoteUser: text(result.remoteUser, "git"),
  };
}

function normalizeAuthorizationResult(result: GitSshAuthorizationResult | undefined) {
  if (result == null) return { allowed: true, message: "", remoteUser: "" };
  if (typeof result === "boolean") {
    return { allowed: result, message: "", remoteUser: "" };
  }

  return {
    allowed: result.allowed === true,
    message: text(result.message),
    remoteUser: text(result.remoteUser),
  };
}

async function resolveRepositoryResult(
  options: CreateGitSshServerOptions,
  repositoryKey: string,
  input: {
    command: string;
    remoteAddress: string;
    service: GitSshService;
    username: string;
    wantsWrite: boolean;
  },
): Promise<GitSshResolvedRepository | null> {
  const resolved = await options.resolveRepository(repositoryKey, input);
  if (!resolved) return null;
  if ("repository" in resolved) {
    return {
      repository: {
        id: text(resolved.repository.id, repositoryKey),
        path: assertAbsoluteRepositoryPath(resolved.repository.path),
      },
      repositoryKey: text(resolved.repositoryKey, repositoryKey),
    };
  }

  return {
    repository: {
      id: text(resolved.id, repositoryKey),
      path: assertAbsoluteRepositoryPath(resolved.path),
    },
    repositoryKey,
  };
}

export {
  normalizeAuthenticationResult,
  normalizeAuthorizationResult,
  parseGitSshCommand,
  resolveRepositoryResult,
  writeGitSshFailure,
};
export type { NormalizedSshAuthenticationResult, ParsedGitSshCommand };
