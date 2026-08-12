function quoteHttpFileName(value: string): string {
  return String(value || "").replace(/["\\]/g, "_");
}

export { quoteHttpFileName };
