import { GoogleGenAI } from "@google/genai";
import { classifyGeminiError } from "./analyze";
import { getAnalysis, listTickets } from "./db";
import { TrendsResultSchema } from "./schemas";
import type { Trend, TrendReport } from "./types";

let aiInstance: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return aiInstance;
}
const MODEL = process.env.ANALYSIS_MODEL ?? "gemini-3.5-flash";

const MAX_ATTEMPTS = 3;
const MAX_TICKETS = 300;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    trends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          impact: { type: "string", enum: ["low", "medium", "high"] },
          ticket_numbers: { type: "array", items: { type: "number" } },
          suggested_action: { type: "string", nullable: true },
        },
        required: ["title", "summary", "impact", "ticket_numbers", "suggested_action"],
      },
    },
  },
  required: ["trends"],
};

const SYSTEM_PROMPT = `You analyze a customer-support ticket queue (from Pylon) to spot trends the support team should know about.

You are given one line per open ticket: its number, state, dates, the AI triage verdict if one exists, the title, and a short summary of what the customer needs.

Respond with a JSON object containing a "trends" array. Each trend:
- title: a short, specific name for the pattern (e.g. "SSO login failures after the June release"), not a generic category.
- summary: two or three sentences describing the pattern, what likely connects the tickets, and why it matters.
- impact: "high" when it affects many customers or blocks core workflows, "medium" for a clear recurring pain point, "low" for a minor but real pattern.
- ticket_numbers: the ticket numbers the trend was observed in. Only use numbers that appear in the input — never invent them. A trend needs at least 2 tickets.
- suggested_action: one concrete next step for the support/product team, or null if none is warranted.

Rules:
- Only report genuine patterns: shared root causes, repeated feature requests, the same confusion appearing across customers, spikes around a date, or clusters of stuck/idle tickets. Do not pad the list — if the queue shows no meaningful patterns, return an empty array.
- Order trends from highest to lowest impact. Report at most 8.
- Base everything strictly on the ticket data provided. Keep prose plain — no markup or field tags.`;

interface CorpusTicket {
  number: number;
  line: string;
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** One compact line per open non-admin ticket, with its cached triage summary when available. */
function buildCorpus(): CorpusTicket[] {
  return listTickets()
    .filter((ticket) => ticket.admin_status === "non_admin")
    .slice(0, MAX_TICKETS)
    .map((ticket) => {
      const analysis = getAnalysis(ticket.id);
      const parts = [
        `#${ticket.number}`,
        `state: ${ticket.state}`,
        `created: ${ticket.created_at?.slice(0, 10) ?? "unknown"}`,
        `last activity: ${ticket.last_activity_at?.slice(0, 10) ?? "unknown"}`,
        `verdict: ${analysis?.verdict ?? "not analyzed"}`,
        `title: ${truncate(ticket.title, 120)}`,
      ];
      if (analysis?.what_customer_needs) {
        parts.push(`customer needs: ${truncate(analysis.what_customer_needs, 200)}`);
      }
      return { number: ticket.number, line: parts.join(" | ") };
    });
}

/**
 * Runs the trend-spotting pass over the current open non-admin queue.
 * Throws with a dashboard-safe message on failure; returns the (unsaved) report on success.
 */
export async function generateTrendReport(): Promise<TrendReport> {
  const corpus = buildCorpus();
  if (corpus.length < 2) {
    return { generated_at: new Date().toISOString(), ticket_count: corpus.length, trends: [] };
  }

  const knownNumbers = new Set(corpus.map((t) => t.number));
  const userContent = `Open support tickets (${corpus.length} total, one per line):

${corpus.map((t) => t.line).join("\n")}`;

  let lastIssue = "no response";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await getAiClient().models.generateContent({
        model: MODEL,
        contents: userContent,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA as any,
        },
      });

      const text = response.text;
      if (!text) {
        lastIssue = "model returned empty content";
        continue;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch (err) {
        lastIssue = `model returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      const parsed = TrendsResultSchema.safeParse(parsedJson);
      if (parsed.success) {
        // Drop hallucinated ticket references and any trend left without the 2-ticket minimum.
        const trends: Trend[] = parsed.data.trends
          .map((trend) => ({
            ...trend,
            ticket_numbers: trend.ticket_numbers.filter((n) => knownNumbers.has(n)),
          }))
          .filter((trend) => trend.ticket_numbers.length >= 2);
        return { generated_at: new Date().toISOString(), ticket_count: corpus.length, trends };
      }
      lastIssue = `model returned malformed trends (${parsed.error.issues[0]?.message ?? "invalid fields"})`;
      console.error(
        `Trend parse failure (attempt ${attempt}):`,
        parsed.error.issues.slice(0, 3),
        JSON.stringify(parsedJson).slice(0, 2000),
      );
    } catch (err) {
      throw classifyGeminiError(err);
    }
  }

  throw new Error(`Trend analysis failed after ${MAX_ATTEMPTS} attempts: ${lastIssue}`);
}
