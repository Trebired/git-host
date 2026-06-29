import type {
  LoggerAdapterEvent,
  LoggerAdapterGenericLogMethod,
  LoggerAdapterLogger,
  LoggerAdapterLogMethod,
  LoggerAdapterWriter,
  NormalizedLoggerAdapter,
} from "@trebired/logger-adapter";

type MaybePromise<T> = T | Promise<T>;

type GitActor = {
  email?: string;
  id?: string;
  name?: string;
};

type GitHostLogMethod = LoggerAdapterLogMethod;
type GitHostLogEvent = LoggerAdapterEvent;
type GitHostGenericLogMethod = LoggerAdapterGenericLogMethod;
type GitHostLogger = LoggerAdapterLogger;
type GitHostLoggerAdapter = LoggerAdapterWriter;
type NormalizedGitHostLogger = NormalizedLoggerAdapter;

export type {
  GitActor,
  GitHostGenericLogMethod,
  GitHostLogEvent,
  GitHostLogger,
  GitHostLoggerAdapter,
  GitHostLogMethod,
  MaybePromise,
  NormalizedGitHostLogger,
};
