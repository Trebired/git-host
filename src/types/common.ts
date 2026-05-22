type MaybePromise<T> = T | Promise<T>;

type GitActor = {
  email?: string;
  id?: string;
  name?: string;
};

type GitHostLogMethod = (group: string, message: string, metadata?: unknown) => unknown;

type GitHostLogEvent = {
  group: string;
  level: "error" | "fail" | "info" | "warn";
  message: string;
  metadata?: unknown;
};

type GitHostGenericLogMethod = (...args: unknown[]) => unknown;

type GitHostLogger = ((
  event: GitHostLogEvent,
) => unknown) | {
  [key: string]: unknown;
  error?: GitHostLogMethod | GitHostGenericLogMethod;
  fail?: GitHostLogMethod | GitHostGenericLogMethod;
  fatal?: GitHostGenericLogMethod;
  info?: GitHostLogMethod | GitHostGenericLogMethod;
  log?: GitHostGenericLogMethod;
  warn?: GitHostLogMethod | GitHostGenericLogMethod;
  write?: GitHostGenericLogMethod;
};

type NormalizedGitHostLogger = {
  error: GitHostLogMethod;
  fail: GitHostLogMethod;
  info: GitHostLogMethod;
  warn: GitHostLogMethod;
};

export type {
  GitActor,
  GitHostGenericLogMethod,
  GitHostLogEvent,
  GitHostLogger,
  GitHostLogMethod,
  MaybePromise,
  NormalizedGitHostLogger,
};
