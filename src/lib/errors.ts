export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A single-line, length-capped error message safe to return to the browser or persist in the DB.
 * Full errors (with stacks) should be logged server-side via console.error at the call site.
 */
export function publicErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  const message = errorMessage(err).split("\n")[0].trim();
  if (!message) return fallback;
  return message.length > 300 ? `${message.slice(0, 297)}…` : message;
}
