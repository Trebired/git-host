export function text(value: unknown, fallback = ""): string {
  const next = String(value == null ? "" : value).trim();
  return next || fallback;
}

export function isTruthy(value: unknown): boolean {
  const next = text(value).toLowerCase();
  return value === true || next === "1" || next === "true" || next === "on" || next === "yes";
}
