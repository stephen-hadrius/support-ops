import type { AnalysisRow } from "./db";
import { VERDICT_LABELS } from "./types";

/**
 * Builds the internal note written to a ticket's close-reason custom field when it's closed.
 * Returns null when there's no analysis to explain the close (the ticket still closes, just without a note).
 */
export function buildCloseReason(analysis: AnalysisRow | undefined): string | null {
  if (!analysis) return null;
  const verdict = VERDICT_LABELS[analysis.verdict] ?? analysis.verdict;
  const parts = [`Closed from triage dashboard · verdict: ${verdict}.`];
  if (analysis.why?.trim()) parts.push(analysis.why.trim());
  return parts.join(" ");
}
