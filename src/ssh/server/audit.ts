import { buildGitHostLogGroup } from "#0bba403f3e43";
import { resolveLogger } from "#5a29135e56c1";
import type { CreateGitSshServerOptions, GitSshAuditEvent } from "#14021226ec9b";
import { emitAsyncEvent } from "#38ephfxhlt3m";

const SSH_LOG_GROUP = buildGitHostLogGroup("ssh");

function reportSshAuditEvent(
  options: CreateGitSshServerOptions,
  logger: ReturnType<typeof resolveLogger>,
  verbose: boolean,
  event: GitSshAuditEvent,
) {
  emitAsyncEvent(options.onAuditEvent, event);

  if (event.outcome === "completed") {
    if (!verbose) return;
    logger.info(SSH_LOG_GROUP, "ssh git request completed", event);
    return;
  }

  if (event.outcome === "failed") {
    logger.error(SSH_LOG_GROUP, "ssh git request failed", event);
    return;
  }

  logger.warn(SSH_LOG_GROUP, "ssh git request rejected", event);
}

export { reportSshAuditEvent };
