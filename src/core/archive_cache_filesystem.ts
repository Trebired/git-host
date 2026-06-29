import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import type { GitArchiveCacheBackend, GitArchiveCacheEntry, GitArchiveCacheReadResult, GitArchiveCacheWriter } from "#1mbdfxwwqqpa";

type CreateFileSystemGitArchiveCacheOptions = {
  rootDir: string;
};

function cachePaths(rootDir: string, cacheKey: string) {
  const digest = createHash("sha256").update(cacheKey).digest("hex");
  const directory = path.join(rootDir, digest.slice(0, 2));
  const baseName = digest.slice(2);
  return {
    dataPath: path.join(directory, `${baseName}.bin`),
    directory,
    metadataPath: path.join(directory, `${baseName}.json`),
  };
}

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.promises.rm(filePath, { force: true });
  } catch {}
}

async function readEntryFromDisk(metadataPath: string, dataPath: string): Promise<GitArchiveCacheEntry | null> {
  let raw = "";
  try {
    raw = await fs.promises.readFile(metadataPath, "utf8");
  } catch {
    return null;
  }

  let entry: GitArchiveCacheEntry | null = null;
  try {
    entry = JSON.parse(raw) as GitArchiveCacheEntry;
  } catch {
    entry = null;
  }
  if (!entry) {
    await Promise.all([removeIfExists(metadataPath), removeIfExists(dataPath)]);
    return null;
  }

  const expiresAt = Date.parse(String(entry.expires_at || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await Promise.all([removeIfExists(metadataPath), removeIfExists(dataPath)]);
    return null;
  }

  try {
    await fs.promises.access(dataPath, fs.constants.R_OK);
  } catch {
    await Promise.all([removeIfExists(metadataPath), removeIfExists(dataPath)]);
    return null;
  }

  try {
    const now = new Date();
    await Promise.all([
      fs.promises.utimes(metadataPath, now, now),
      fs.promises.utimes(dataPath, now, now),
    ]);
  } catch {}

  return entry;
}

async function listMetadataFiles(rootDir: string): Promise<string[]> {
  const pending = [rootDir];
  const files: string[] = [];

  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".tmp") continue;
        pending.push(nextPath);
        continue;
      }
      if (entry.isFile() && nextPath.endsWith(".json")) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

async function cleanupMetadataFile(metadataPath: string, now: Date) {
  const dataPath = metadataPath.replace(/\.json$/u, ".bin");
  const entry = await readEntryFromDisk(metadataPath, dataPath);
  if (entry) return 0;

  try {
    const stats = await fs.promises.stat(metadataPath);
    if (stats.mtimeMs > now.getTime()) return 0;
  } catch {}
  return 1;
}

function createArchiveCacheWriter(
  tempDataPath: string,
  tempMetadataPath: string,
  dataPath: string,
  metadataPath: string,
) {
  const stream = fs.createWriteStream(tempDataPath);
  return {
    async abort() {
      stream.destroy();
      await Promise.all([
        removeIfExists(tempDataPath),
        removeIfExists(tempMetadataPath),
      ]);
    },

    async complete(entry: GitArchiveCacheEntry) {
      await fs.promises.writeFile(tempMetadataPath, JSON.stringify(entry, null, 2), "utf8");
      await fs.promises.rename(tempDataPath, dataPath).catch(async () => {
        await removeIfExists(dataPath);
        await fs.promises.rename(tempDataPath, dataPath);
      });
      await fs.promises.rename(tempMetadataPath, metadataPath).catch(async () => {
        await removeIfExists(metadataPath);
        await fs.promises.rename(tempMetadataPath, metadataPath);
      });
    },

    stream,
  } satisfies GitArchiveCacheWriter;
}

function createFileSystemGitArchiveCache(options: CreateFileSystemGitArchiveCacheOptions): GitArchiveCacheBackend {
  const rootDir = path.resolve(String(options.rootDir || ""));
  const tempDir = path.join(rootDir, ".tmp");

  return {
    async cleanupExpired(now = new Date()) {
      const metadataFiles = await listMetadataFiles(rootDir);
      let deleted = 0;

      await Promise.all(metadataFiles.map(async (metadataPath) => {
        deleted += await cleanupMetadataFile(metadataPath, now);
      }));

      return deleted;
    },

    async readEntry(cacheKey) {
      const { dataPath, metadataPath } = cachePaths(rootDir, cacheKey);
      return await readEntryFromDisk(metadataPath, dataPath);
    },

    async openReadStream(cacheKey): Promise<GitArchiveCacheReadResult | null> {
      const { dataPath, metadataPath } = cachePaths(rootDir, cacheKey);
      const entry = await readEntryFromDisk(metadataPath, dataPath);
      if (!entry) return null;
      return {
        entry,
        stream: fs.createReadStream(dataPath),
      };
    },

    async prepareWrite(cacheKey): Promise<GitArchiveCacheWriter> {
      const { dataPath, directory, metadataPath } = cachePaths(rootDir, cacheKey);
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.mkdir(tempDir, { recursive: true });

      const tempDataPath = path.join(tempDir, `${randomUUID()}.bin`);
      const tempMetadataPath = path.join(tempDir, `${randomUUID()}.json`);
      return createArchiveCacheWriter(tempDataPath, tempMetadataPath, dataPath, metadataPath);
    },
  };
}

export { createFileSystemGitArchiveCache };
export type { CreateFileSystemGitArchiveCacheOptions };
