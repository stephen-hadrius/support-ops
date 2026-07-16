/**
 * Client-side counterpart to publicErrorMessage: turns caught fetch/exception values into a
 * single-line message fit for a toast or banner instead of e.g. "TypeError: Failed to fetch".
 */
export function friendlyError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return "Could not reach the server — is it still running?";
  }
  if (err instanceof Error) {
    const message = err.message.split("\n")[0].trim();
    if (message) return message.length > 300 ? `${message.slice(0, 297)}…` : message;
  }
  return fallback;
}
