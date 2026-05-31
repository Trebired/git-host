import { spawn } from "node:child_process";

import { Server as GitSshServerTransport, utils as sshUtils } from "ssh2";

import { resolveLogger } from "../logging.js";
import type { CreateGitSshServerOptions } from "../types.js";
import { text } from "../utils/text.js";
import { reportSshAuditEvent } from "./server/audit.js";
import {
  normalizeAuthenticationResult,
  normalizeAuthorizationResult,
  parseGitSshCommand,
  resolveRepositoryResult,
  writeGitSshFailure,
} from "./server/shared.js";

function createGitSshServer(options: CreateGitSshServerOptions) {
  if (!options || typeof options.authenticate !== "function") {
    throw new TypeError("createGitSshServer() requires an authenticate() function.");
  }
  if (!options || typeof options.resolveRepository !== "function") {
    throw new TypeError("createGitSshServer() requires a resolveRepository() function.");
  }
  if (!Array.isArray(options.hostKeys) || !options.hostKeys.length) {
    throw new TypeError("createGitSshServer() requires at least one host key.");
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const verbose = options.verbose === true;
  const sshServer: any = new GitSshServerTransport({
    hostKeys: options.hostKeys,
  });

  sshServer.on("connection", (connection: any) => {
    connection.on("authentication", async (ctx: any) => {
      const remoteAddress = text(connection && connection._sock && connection._sock.remoteAddress);
      const username = text(ctx.username);

      if (ctx.method !== "publickey" || !ctx.key || !Buffer.isBuffer(ctx.key.data)) {
        reportSshAuditEvent(options, logger, verbose, {
          message: "Only public key authentication is supported.",
          outcome: "auth_rejected",
          remoteAddress,
          username,
        });
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
        reportSshAuditEvent(options, logger, verbose, {
          message: "SSH public key authentication failed.",
          outcome: "auth_rejected",
          remoteAddress,
          username,
        });
        ctx.reject();
        return;
      }

      const parsedKey: any = sshUtils.parseKey(auth.publicKey);
      const usableKey = Array.isArray(parsedKey) ? parsedKey[0] : parsedKey;
      if (!usableKey || usableKey instanceof Error) {
        reportSshAuditEvent(options, logger, verbose, {
          identity: auth.identity,
          message: "SSH public key could not be parsed.",
          outcome: "auth_rejected",
          remoteAddress,
          remoteUser: auth.remoteUser,
          username,
        });
        ctx.reject();
        return;
      }
      if (text(usableKey.type) !== text(ctx.key.algo)) {
        reportSshAuditEvent(options, logger, verbose, {
          identity: auth.identity,
          message: "SSH public key type mismatch.",
          outcome: "auth_rejected",
          remoteAddress,
          remoteUser: auth.remoteUser,
          username,
        });
        ctx.reject();
        return;
      }
      if (ctx.signature && usableKey.verify(ctx.blob, ctx.signature, ctx.hashAlgo) !== true) {
        reportSshAuditEvent(options, logger, verbose, {
          identity: auth.identity,
          message: "SSH signature verification failed.",
          outcome: "auth_rejected",
          remoteAddress,
          remoteUser: auth.remoteUser,
          username,
        });
        ctx.reject();
        return;
      }

      connection.__git_ssh_auth = {
        identity: auth.identity,
        remoteAddress,
        remoteUser: auth.remoteUser,
        username: text(ctx.username),
      };
      ctx.accept();
    });

    connection.on("ready", () => {
      const auth = connection.__git_ssh_auth;
      if (!auth) {
        connection.end();
        return;
      }

      connection.on("session", (acceptSession: any) => {
        const session = acceptSession();
        session.on("shell", (_accept: any, reject: any) => reject());
        session.on("pty", (_accept: any, reject: any) => reject());
        session.on("subsystem", (_accept: any, reject: any) => reject());
        session.on("sftp", (_accept: any, reject: any) => reject());
        session.on("exec", async (acceptExec: any, rejectExec: any, info: any) => {
          const requested = parseGitSshCommand(info && info.command, options.basePath);
          if (!requested) {
            reportSshAuditEvent(options, logger, verbose, {
              command: text(info && info.command),
              identity: auth.identity,
              message: "Only Git SSH commands are supported.",
              outcome: "command_rejected",
              remoteAddress: auth.remoteAddress,
              remoteUser: auth.remoteUser,
              username: auth.username,
            });
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
            reportSshAuditEvent(options, logger, verbose, {
              command: requested.command,
              identity: auth.identity,
              message: "Repository not found.",
              outcome: "repository_not_found",
              remoteAddress: auth.remoteAddress,
              remoteUser: auth.remoteUser,
              repositoryKey: requested.repositoryKey,
              service: requested.service,
              username: auth.username,
              wantsWrite: requested.wantsWrite,
            });
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
            reportSshAuditEvent(options, logger, verbose, {
              command: requested.command,
              identity: auth.identity,
              message: authz.message || "Permission denied.",
              outcome: "denied",
              remoteAddress: auth.remoteAddress,
              remoteUser: authz.remoteUser || auth.remoteUser,
              repository: resolved.repository,
              repositoryKey: text(resolved.repositoryKey, requested.repositoryKey),
              service: requested.service,
              username: auth.username,
              wantsWrite: requested.wantsWrite,
            });
            writeGitSshFailure(channel, authz.message || "Permission denied.");
            return;
          }

          const child = spawn(requested.service, [resolved.repository.path], {
            env: {
              ...process.env,
              REMOTE_ADDR: auth.remoteAddress,
              REMOTE_USER: authz.remoteUser || auth.remoteUser,
            },
            stdio: ["pipe", "pipe", "pipe"],
          });

          child.stdout.on("data", (chunk) => {
            try { channel.write(chunk); } catch {}
          });
          child.stderr.on("data", (chunk) => {
            try { channel.stderr.write(chunk); } catch {}
          });
          child.on("close", (code) => {
            reportSshAuditEvent(options, logger, verbose, {
              command: requested.command,
              exitCode: Number(code) || 0,
              identity: auth.identity,
              outcome: Number(code) === 0 ? "completed" : "failed",
              remoteAddress: auth.remoteAddress,
              remoteUser: authz.remoteUser || auth.remoteUser,
              repository: resolved.repository,
              repositoryKey: text(resolved.repositoryKey, requested.repositoryKey),
              service: requested.service,
              username: auth.username,
              wantsWrite: requested.wantsWrite,
            });
            try { channel.exit(Number(code) || 0); } catch {}
            try { channel.close(); } catch {}
          });
          child.on("error", (error: any) => {
            reportSshAuditEvent(options, logger, verbose, {
              command: requested.command,
              identity: auth.identity,
              message: error && error.message ? String(error.message) : "Git process failed.",
              outcome: "failed",
              remoteAddress: auth.remoteAddress,
              remoteUser: authz.remoteUser || auth.remoteUser,
              repository: resolved.repository,
              repositoryKey: text(resolved.repositoryKey, requested.repositoryKey),
              service: requested.service,
              username: auth.username,
              wantsWrite: requested.wantsWrite,
            });
            writeGitSshFailure(channel, error && error.message ? error.message : "Git process failed.");
          });

          channel.on("data", (chunk: Buffer) => {
            try { child.stdin.write(chunk); } catch {}
          });
          channel.on("close", () => {
            try { child.stdin.end(); } catch {}
            if (!child.killed) {
              try { child.kill(); } catch {}
            }
          });
        });
      });
    });
  });

  return sshServer;
}

export { createGitSshServer, parseGitSshCommand };
