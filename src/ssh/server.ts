import { spawn } from "node:child_process";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { Server as GitSshServerTransport, utils as sshUtils } from "ssh2";

import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitSshServerOptions } from "#1mbdfxwwqqpa";
import { text } from "#sy81xkgkmoa0";
import { reportSshAuditEvent } from "./server/audit.js";
import {
  normalizeAuthenticationResult,
  normalizeAuthorizationResult,
  parseGitSshCommand,
  resolveRepositoryResult,
  writeGitSshFailure,
} from "./server/shared.js";

type GitSshRuntime = {
  logger: ReturnType<typeof resolveLogger>;
  verbose: boolean;
};

type GitSshAuthState = {
  identity: unknown;
  remoteAddress: string;
  remoteUser: string;
  username: string;
};

function validateCreateGitSshServerOptions(options: CreateGitSshServerOptions) {
  if (!options || typeof options.authenticate !== "function") {
    throw new TypeError("createGitSshServer() requires an authenticate() function.");
  }
  if (!options || typeof options.resolveRepository !== "function") {
    throw new TypeError("createGitSshServer() requires a resolveRepository() function.");
  }
  if (!Array.isArray(options.hostKeys) || !options.hostKeys.length) {
    throw new TypeError("createGitSshServer() requires at least one host key.");
  }
}

function createGitSshRuntime(options: CreateGitSshServerOptions): GitSshRuntime {
  logPackageInitialized({
    adapter: options.loggerAdapter,
    fallback: "console",
    group: "git-host.ssh",
    logger: options.logger,
    source: "@trebired/git-host",
  });
  return {
    logger: resolveLogger(options.logger, options.loggerAdapter),
    verbose: options.verbose === true,
  };
}

function rejectSshAuthentication(options: CreateGitSshServerOptions, runtime: GitSshRuntime, input: Record<string, unknown>) {
  reportSshAuditEvent(options, runtime.logger, runtime.verbose, input as any);
}

function parseAuthorizedKey(publicKey: string) {
  const parsedKey: any = sshUtils.parseKey(publicKey);
  return Array.isArray(parsedKey) ? parsedKey[0] : parsedKey;
}

async function authenticateSshConnection(
  options: CreateGitSshServerOptions,
  runtime: GitSshRuntime,
  connection: any,
  ctx: any,
) {
  const remoteAddress = text(connection?._sock?.remoteAddress);
  const username = text(ctx.username);
  if (ctx.method !== "publickey" || !ctx.key || !Buffer.isBuffer(ctx.key.data)) {
    rejectSshAuthentication(options, runtime, { message: "Only public key authentication is supported.", outcome: "auth_rejected", remoteAddress, username });
    ctx.reject();
    return;
  }
  const offeredPublicKey = `${text(ctx.key.algo)} ${ctx.key.data.toString("base64")}`;
  const auth = normalizeAuthenticationResult(await options.authenticate({
    keyType: text(ctx.key.algo),
    publicKey: offeredPublicKey,
    publicKeyData: Buffer.from(ctx.key.data),
    remoteAddress,
    username,
  }));
  if (!auth) {
    rejectSshAuthentication(options, runtime, { message: "SSH public key authentication failed.", outcome: "auth_rejected", remoteAddress, username });
    ctx.reject();
    return;
  }
  const usableKey = parseAuthorizedKey(auth.publicKey);
  if (!usableKey || usableKey instanceof Error || text(usableKey.type) !== text(ctx.key.algo)) {
    rejectSshAuthentication(options, runtime, { identity: auth.identity, message: "SSH public key validation failed.", outcome: "auth_rejected", remoteAddress, remoteUser: auth.remoteUser, username });
    ctx.reject();
    return;
  }
  if (ctx.signature && usableKey.verify(ctx.blob, ctx.signature, ctx.hashAlgo) !== true) {
    rejectSshAuthentication(options, runtime, { identity: auth.identity, message: "SSH signature verification failed.", outcome: "auth_rejected", remoteAddress, remoteUser: auth.remoteUser, username });
    ctx.reject();
    return;
  }
  connection.__git_ssh_auth = {
    identity: auth.identity,
    remoteAddress,
    remoteUser: auth.remoteUser,
    username,
  } satisfies GitSshAuthState;
  ctx.accept();
}

function rejectUnsupportedSessionChannels(session: any) {
  session.on("shell", (_accept: any, reject: any) => reject());
  session.on("pty", (_accept: any, reject: any) => reject());
  session.on("subsystem", (_accept: any, reject: any) => reject());
  session.on("sftp", (_accept: any, reject: any) => reject());
}

function writeSshAuditEvent(
  options: CreateGitSshServerOptions,
  runtime: GitSshRuntime,
  event: Record<string, unknown>,
) {
  reportSshAuditEvent(options, runtime.logger, runtime.verbose, event as any);
  if (options.activity) void Promise.resolve(options.activity.recordSshAuditEvent(event as any)).catch(() => {});
}

function pipeGitProcessToChannel(child: ReturnType<typeof spawn>, channel: any) {
  child.stdout.on("data", (chunk) => { try { channel.write(chunk); } catch {} });
  child.stderr.on("data", (chunk) => { try { channel.stderr.write(chunk); } catch {} });
  channel.on("data", (chunk: Buffer) => { try { child.stdin.write(chunk); } catch {} });
  channel.on("close", () => {
    try { child.stdin.end(); } catch {}
    if (!child.killed) {
      try { child.kill(); } catch {}
    }
  });
}

async function handleGitSshExec(
  options: CreateGitSshServerOptions,
  runtime: GitSshRuntime,
  auth: GitSshAuthState,
  acceptExec: any,
  rejectExec: any,
  info: any,
) {
  const requested = parseGitSshCommand(info?.command, options.basePath);
  if (!requested) {
    rejectSshAuthentication(options, runtime, { command: text(info?.command), identity: auth.identity, message: "Only Git SSH commands are supported.", outcome: "command_rejected", remoteAddress: auth.remoteAddress, remoteUser: auth.remoteUser, username: auth.username });
    rejectExec();
    return;
  }
  const resolved = await resolveRepositoryResult(options, requested.repositoryKey, {
    command: requested.command,
    remoteAddress: auth.remoteAddress,
    service: requested.service,
    username: auth.username,
    wantsWrite: requested.wantsWrite,
  });
  const channel = acceptExec();
  if (!resolved) {
    rejectSshAuthentication(options, runtime, { command: requested.command, identity: auth.identity, message: "Repository not found.", outcome: "repository_not_found", remoteAddress: auth.remoteAddress, remoteUser: auth.remoteUser, repositoryKey: requested.repositoryKey, service: requested.service, username: auth.username, wantsWrite: requested.wantsWrite });
    writeGitSshFailure(channel, "Repository not found.");
    return;
  }
  const authz = normalizeAuthorizationResult(options.authorize
    ? await options.authorize({
      command: requested.command,
      identity: auth.identity,
      remoteAddress: auth.remoteAddress,
      remoteUser: auth.remoteUser,
      repository: resolved.repository,
      repositoryKey: text(resolved.repositoryKey, requested.repositoryKey),
      service: requested.service,
      username: auth.username,
      wantsWrite: requested.wantsWrite,
    })
    : undefined);
  if (!authz.allowed) {
    rejectSshAuthentication(options, runtime, { command: requested.command, identity: auth.identity, message: authz.message || "Permission denied.", outcome: "denied", remoteAddress: auth.remoteAddress, remoteUser: authz.remoteUser || auth.remoteUser, repository: resolved.repository, repositoryKey: text(resolved.repositoryKey, requested.repositoryKey), service: requested.service, username: auth.username, wantsWrite: requested.wantsWrite });
    writeGitSshFailure(channel, authz.message || "Permission denied.");
    return;
  }
  const child = spawn(requested.service, [resolved.repository.path], {
    env: { ...process.env, REMOTE_ADDR: auth.remoteAddress, REMOTE_USER: authz.remoteUser || auth.remoteUser },
    stdio: ["pipe", "pipe", "pipe"],
  });
  pipeGitProcessToChannel(child, channel);
  child.on("close", (code) => {
    const event = { command: requested.command, exitCode: Number(code) || 0, identity: auth.identity, outcome: Number(code) === 0 ? "completed" : "failed", remoteAddress: auth.remoteAddress, remoteUser: authz.remoteUser || auth.remoteUser, repository: resolved.repository, repositoryKey: text(resolved.repositoryKey, requested.repositoryKey), service: requested.service, username: auth.username, wantsWrite: requested.wantsWrite };
    writeSshAuditEvent(options, runtime, event);
    try { channel.exit(Number(code) || 0); } catch {}
    try { channel.close(); } catch {}
  });
  child.on("error", (error: any) => {
    rejectSshAuthentication(options, runtime, { command: requested.command, identity: auth.identity, message: error?.message ? String(error.message) : "Git process failed.", outcome: "failed", remoteAddress: auth.remoteAddress, remoteUser: authz.remoteUser || auth.remoteUser, repository: resolved.repository, repositoryKey: text(resolved.repositoryKey, requested.repositoryKey), service: requested.service, username: auth.username, wantsWrite: requested.wantsWrite });
    writeGitSshFailure(channel, error?.message ? error.message : "Git process failed.");
  });
}

function registerSshSession(
  options: CreateGitSshServerOptions,
  runtime: GitSshRuntime,
  connection: any,
) {
  const auth = connection.__git_ssh_auth as GitSshAuthState | undefined;
  if (!auth) {
    connection.end();
    return;
  }
  connection.on("session", (acceptSession: any) => {
    const session = acceptSession();
    rejectUnsupportedSessionChannels(session);
    session.on("exec", async (acceptExec: any, rejectExec: any, info: any) => {
      await handleGitSshExec(options, runtime, auth, acceptExec, rejectExec, info);
    });
  });
}

function createGitSshServer(options: CreateGitSshServerOptions) {
  validateCreateGitSshServerOptions(options);
  const runtime = createGitSshRuntime(options);
  const sshServer: any = new GitSshServerTransport({ hostKeys: options.hostKeys });
  sshServer.on("connection", (connection: any) => {
    connection.on("authentication", async (ctx: any) => {
      await authenticateSshConnection(options, runtime, connection, ctx);
    });
    connection.on("ready", () => {
      registerSshSession(options, runtime, connection);
    });
  });
  return sshServer;
}

export { createGitSshServer, parseGitSshCommand };
