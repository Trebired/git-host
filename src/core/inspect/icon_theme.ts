import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { generateManifest, type Manifest } from "material-icon-theme";

import type { GitTreeEntry, GitTreeEntryIcon } from "../../types.js";
import { text } from "../../utils/text.js";

const require = createRequire(import.meta.url);

let manifestCache: Manifest | null = null;
let manifestRootDirCache = "";
const svgCache = new Map<string, string>();

function readSvg(iconPath: string): string | null {
  const cached = svgCache.get(iconPath);
  if (cached != null) return cached;

  try {
    const svg = fs.readFileSync(iconPath, "utf8");
    svgCache.set(iconPath, svg);
    return svg;
  } catch {
    return null;
  }
}

function getManifest(): Manifest {
  if (!manifestCache) {
    manifestCache = generateManifest();
  }
  return manifestCache;
}

function getManifestRootDir(): string {
  if (!manifestRootDirCache) {
    const packageEntry = require.resolve("material-icon-theme");
    manifestRootDirCache = path.dirname(path.dirname(packageEntry));
  }
  return manifestRootDirCache;
}

function lookupByExactName(associations: Record<string, string> | undefined, name: string): string {
  return text(
    associations && (associations[name] || associations[name.toLowerCase()]),
  );
}

function lookupByLongestExtension(associations: Record<string, string> | undefined, name: string): string {
  if (!associations) return "";

  const parts = text(name).toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2) return "";

  for (let index = 1; index < parts.length; index += 1) {
    const candidate = parts.slice(index).join(".");
    const iconName = text(associations[candidate]);
    if (iconName) return iconName;
  }

  return "";
}

function resolveIconName(entry: GitTreeEntry, manifest: Manifest): string {
  if (entry.type === "tree") {
    return lookupByExactName(manifest.folderNames, entry.name) || text(manifest.folder);
  }

  return (
    lookupByExactName(manifest.fileNames, entry.name)
    || lookupByLongestExtension(manifest.fileExtensions, entry.name)
    || text(manifest.file)
  );
}

function resolveTreeEntryIcon(entry: GitTreeEntry): GitTreeEntryIcon | null {
  const manifest = getManifest();
  const iconName = resolveIconName(entry, manifest);
  const relativeIconPath = text(manifest.iconDefinitions && manifest.iconDefinitions[iconName] && manifest.iconDefinitions[iconName].iconPath);
  if (!iconName || !relativeIconPath) return null;

  const absoluteIconPath = path.resolve(getManifestRootDir(), relativeIconPath);
  const svg = readSvg(absoluteIconPath);
  return svg ? { name: iconName, svg } : null;
}

export { resolveTreeEntryIcon };
