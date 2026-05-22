import { createRequire } from "node:module";

import type {
  GitHostLogEvent,
  GitHostLogMethod,
  GitHostLogger,
  NormalizedGitHostLogger,
} from "./types.js";

type ConsoleLevel = "error" | "info" | "warn";
type GitHostLogLevel = GitHostLogEvent["level"];

type TrebiredLoggerModule = {
  createLog?: (options?: Record<string, unknown>) => GitHostLogger;
};

let defaultLoggerCache: GitHostLogger | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function getLoggerMethod(source: GitHostLogger | null | undefined, name: string) {
  if (!isRecord(source)) return null;
  const value = source[name];
  return typeof value === "function" ? value : null;
}

function buildLogEvent(level: GitHostLogLevel, group: string, message: string, metadata?: unknown): GitHostLogEvent {
  return metadata === undefined
    ? { group, level, message }
    : { group, level, message, metadata };
}

function formatLogMessage(group: string, message: string): string {
  return `[${group}] ${message}`;
}

function buildStructuredPayload(event: GitHostLogEvent): Record<string, unknown> {
  if (isPlainObject(event.metadata)) {
    return {
      group: event.group,
      ...event.metadata,
    };
  }

  return event.metadata === undefined
    ? { group: event.group }
    : {
      group: event.group,
      metadata: event.metadata,
    };
}

function fallbackLogger(level: ConsoleLevel): GitHostLogMethod {
  return (group: string, message: string, metadata?: unknown) => {
    const prefix = formatLogMessage(group, message);
    if (metadata !== undefined) console[level](prefix, metadata);
    else console[level](prefix);
  };
}

function looksLikeTrebiredLogger(source: GitHostLogger | null | undefined): boolean {
  return Boolean(
    getLoggerMethod(source, "fail")
      || getLoggerMethod(source, "group")
      || getLoggerMethod(source, "withScope")
      || getLoggerMethod(source, "flush")
      || getLoggerMethod(source, "getStats"),
  );
}

function looksLikeObjectFirstLevelLogger(source: GitHostLogger | null | undefined): boolean {
  if (!isRecord(source)) return false;
  return Boolean(
    getLoggerMethod(source, "child")
      || getLoggerMethod(source, "bindings")
      || (source.levels && typeof source.levels === "object"),
  );
}

function callEventSink(source: GitHostLogger | null | undefined, event: GitHostLogEvent): boolean {
  if (typeof source === "function") {
    source(event);
    return true;
  }

  const sink = getLoggerMethod(source, "write") || getLoggerMethod(source, "log");
  if (!sink) return false;

  sink.call(source, event);
  return true;
}

function callLevelMethod(
  source: GitHostLogger | null | undefined,
  level: GitHostLogLevel,
  event: GitHostLogEvent,
): boolean {
  const alias = level === "fail" ? "fatal" : level;
  const method = getLoggerMethod(source, level) || getLoggerMethod(source, alias);
  if (!method) return false;

  if (looksLikeTrebiredLogger(source)) {
    method.call(source, event.group, event.message, event.metadata);
    return true;
  }

  if (looksLikeObjectFirstLevelLogger(source)) {
    method.call(source, buildStructuredPayload(event), event.message);
    return true;
  }

  if (event.metadata === undefined) {
    method.call(source, formatLogMessage(event.group, event.message));
    return true;
  }

  method.call(source, formatLogMessage(event.group, event.message), event.metadata);
  return true;
}

function tryResolveDefaultLogger(): GitHostLogger | null {
  if (defaultLoggerCache !== undefined) return defaultLoggerCache;

  try {
    const require = createRequire(import.meta.url);
    const mod = require("@trebired/logger") as TrebiredLoggerModule;
    if (typeof mod.createLog === "function") {
      defaultLoggerCache = mod.createLog({
        console: true,
        quiet: true,
        save: false,
        source: "@trebired/git-host",
      });
      return defaultLoggerCache;
    }
  } catch {}

  defaultLoggerCache = null;
  return defaultLoggerCache;
}

function resolveLogMethod(
  source: GitHostLogger | null | undefined,
  level: GitHostLogLevel,
  fallback: GitHostLogMethod,
): GitHostLogMethod {
  return (group: string, message: string, metadata?: unknown) => {
    const event = buildLogEvent(level, group, message, metadata);
    if (callLevelMethod(source, level, event)) return;
    if (callEventSink(source, event)) return;
    fallback(group, message, metadata);
  };
}

function resolveLogger(logger?: GitHostLogger): NormalizedGitHostLogger {
  const source = logger ?? tryResolveDefaultLogger();

  return {
    info: resolveLogMethod(source, "info", fallbackLogger("info")),
    warn: resolveLogMethod(source, "warn", fallbackLogger("warn")),
    error: resolveLogMethod(source, "error", fallbackLogger("error")),
    fail: resolveLogMethod(source, "fail", fallbackLogger("error")),
  };
}

export { resolveLogger };
