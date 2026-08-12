import type { ServerResponse } from "node:http";

function applyHeaders(res: ServerResponse, headers: Record<string, string>|undefined) {
  const nextHeaders = headers && typeof headers === "object" ? headers : {};
  for (const [name, value] of Object.entries(nextHeaders)) {
    if (!name || typeof value !== "string") continue;
    res.setHeader(name, value);
  }
}

export { applyHeaders };
