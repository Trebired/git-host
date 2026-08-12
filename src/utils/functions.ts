function noop() {}

function emitAsyncEvent<T>(listener: ((event: T) => unknown) | undefined, event: T) {
  if (typeof listener !== "function") return;
  void Promise.resolve(listener(event)).catch (noop);
}

export { emitAsyncEvent, noop };
