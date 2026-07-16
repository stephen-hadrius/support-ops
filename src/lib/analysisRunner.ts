import { analyzeTicket } from "./analyze";
import {
  getAnalysis,
  getTicket,
  saveAnalysis,
  saveAnalysisFailure,
  saveTicketMessages,
  toAnalysis,
} from "./db";
import { publicErrorMessage } from "./errors";
import { searchKnowledge } from "./mcp/notion";
import { searchCompliance } from "./mcp/hadrius";
import { searchLinear } from "./mcp/linear";
import { getIssueMessages } from "./mcp/pylon";
import type { Analysis } from "./types";

export type RunAnalysisOutcome =
  | { status: "missing" }
  | { status: "cached"; analysis: Analysis }
  | { status: "analyzed"; analysis: Analysis }
  | { status: "failed"; error: string };

/**
 * Analyzes one ticket end-to-end: fetch thread (caching it for the thread viewer), search Notion
 * knowledge, run Claude, persist the verdict or the failure. Shared by the single-ticket API route
 * and the server-side queue.
 */
export async function runAnalysisForTicket(
  baseUrl: string,
  ticketId: string,
  force = false,
): Promise<RunAnalysisOutcome> {
  const ticket = getTicket(ticketId);
  if (!ticket) return { status: "missing" };

  const cached = getAnalysis(ticketId);
  if (cached && !force && cached.last_activity_at === ticket.last_activity_at) {
    return { status: "cached", analysis: toAnalysis(cached) };
  }

  try {
    const messages = await getIssueMessages(baseUrl, ticketId);
    saveTicketMessages(ticketId, ticket.last_activity_at, JSON.stringify(messages), new Date().toISOString());

    const knowledge = await searchKnowledge(baseUrl, ticket.title);
    const compliance = await searchCompliance(baseUrl, ticket.title);
    const linear = await searchLinear(baseUrl, ticket.title);
    const result = await analyzeTicket({
      title: ticket.title,
      number: ticket.number,
      state: ticket.state,
      messages,
      knowledge: knowledge.text,
      compliance: compliance.text,
      linear: linear.text,
    });

    const computedAt = new Date().toISOString();
    const grounded = knowledge.text.trim().length > 0 || compliance.text.trim().length > 0 || linear.text.trim().length > 0;
    saveAnalysis(ticketId, ticket.last_activity_at, result, computedAt, grounded);
    const saved = getAnalysis(ticketId);
    if (!saved) return { status: "failed", error: "Analysis was not persisted" };
    return { status: "analyzed", analysis: toAnalysis(saved) };
  } catch (err) {
    console.error(`Analysis failed for ticket #${ticket.number}:`, err);
    const message = publicErrorMessage(err, "Analysis failed");
    saveAnalysisFailure(ticketId, ticket.last_activity_at, message, new Date().toISOString());
    return { status: "failed", error: message };
  }
}
