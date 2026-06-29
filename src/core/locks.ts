const repositoryMutationTails = new Map<string, Promise<void>>();

class RepositoryLockManager {
  async withLock<T>(keyInput: unknown, operation: () => Promise<T>): Promise<T> {
    const key = String(keyInput == null ? "" : keyInput).trim();
    if (!key) return await operation();

    const previous = repositoryMutationTails.get(key) || Promise.resolve();
    let release = function () {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => {}).then(() => gate);
    repositoryMutationTails.set(key, tail);

    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (repositoryMutationTails.get(key) === tail) {
        repositoryMutationTails.delete(key);
      }
    }
  }
}

export { RepositoryLockManager };
