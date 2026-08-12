import { text } from "#62f869522d1f";

function normalizeStringRecord(value: unknown): Record<string, string>|undefined {
  if (!value || typeof value !== "object") return undefined;
  const next = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => [text(key), text(entry)] as const)
    .filter(([key, entry]) => key && entry),
  );
  return Object.keys(next).length ? next : undefined;
}

export { normalizeStringRecord };
