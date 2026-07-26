import { resolveLogger } from "#5a29135e56c1";
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
    logger.info("package.git-host.ssh", "ssh git request completed", event);
    return;
  }

  if (event.outcome === "failed") {
    logger.error("package.git-host.ssh", "ssh git request failed", event);
    return;
  }

  logger.warn("package.git-host.ssh", "ssh git request rejected", event);
}

export { reportSshAuditEvent };
