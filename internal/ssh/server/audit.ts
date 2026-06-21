import { resolveLogger } from "#cqgsder5zlmf";
import type { CreateGitSshServerOptions, GitSshAuditEvent } from "#1mbdfxwwqqpa";

function emitSshAuditEvent(
  onAuditEvent: ((event: GitSshAuditEvent) => unknown) | undefined,
  event: GitSshAuditEvent,
) {
  if (typeof onAuditEvent !== "function") return;
  void Promise.resolve(onAuditEvent(event)).catch(() => {});
}

function reportSshAuditEvent(
  options: CreateGitSshServerOptions,
  logger: ReturnType<typeof resolveLogger>,
  verbose: boolean,
  event: GitSshAuditEvent,
) {
  emitSshAuditEvent(options.onAuditEvent, event);

  if (event.outcome === "completed") {
    if (!verbose) return;
    logger.info("git-host.ssh", "ssh git request completed", event);
    return;
  }

  if (event.outcome === "failed") {
    logger.error("git-host.ssh", "ssh git request failed", event);
    return;
  }

  logger.warn("git-host.ssh", "ssh git request rejected", event);
}

export { reportSshAuditEvent };
