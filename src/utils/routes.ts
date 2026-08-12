import { text } from "#62f869522d1f";

function normalizeHttpBasePath(value: unknown): string {
  const next = text(value).replace(/\/+$/g, "");
  if (!next || next === "/") return "";
  return next.startsWith("/") ? next : `/${next}`;
}

function normalizeSocketPath(basePathInput: unknown, socketPathInput: unknown): string {
  const socketPath = text(socketPathInput).replace(/\/+$/g, "");
  if (socketPath) {
    return socketPath.startsWith("/") ? socketPath : `/${socketPath}`;
  }

  const basePath = text(basePathInput).replace(/\/+$/g, "");
  if (!basePath || basePath === "/") return "/socket.io";
  return `${basePath.startsWith("/") ? basePath : `/${basePath}`}/socket.io`;
}

export { normalizeHttpBasePath, normalizeSocketPath };
