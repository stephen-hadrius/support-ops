import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { PylonMessage } from "./mcp/pylon";
import { AnalysisResultSchema } from "./schemas";
import { stripHtml } from "./text";

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

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type AnalysisSource = AnalysisResult["sources"][number];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["close", "follow_up", "confirmation"] },
    what_customer_needs: { type: "string" },
    why: { type: "string" },
    needs_reply: { type: "boolean" },
    draft_reply: { type: "string", nullable: true },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["thread", "knowledge", "compliance", "linear", "pylon_kb"] },
          reference: { type: "string" },
          url: { type: "string", nullable: true },
        },
        required: ["type", "reference", "url"],
      },
    },
  },
  required: ["verdict", "what_customer_needs", "why", "needs_reply", "draft_reply", "sources"],
};

const MAX_ATTEMPTS = 3;

/** Maps SDK transport errors to concise messages safe to surface in the dashboard. */
export function classifyGeminiError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit|429/i.test(message)) {
    return new Error("Gemini rate limit exceeded — try again shortly");
  }
  if (/timeout/i.test(message)) {
    return new Error("Gemini request timed out");
  }
  if (/network|fetch failed|connection/i.test(message)) {
    return new Error("Could not reach the Gemini API");
  }
  return err instanceof Error ? err : new Error(message);
}

function formatThread(messages: PylonMessage[]): string {
  if (messages.length === 0) return "(no messages)";
  return messages
    .map((message) => {
      const speaker = message.from_customer ? "Customer" : "Support";
      const label = message.is_private ? "INTERNAL NOTE" : "CUSTOMER-FACING";
      return `[${label}] ${speaker} (${message.sent_at ?? "unknown time"}): ${stripHtml(message.body_html ?? "")}`;
    })
    .join("\n\n");
}

const SYSTEM_PROMPT = `You triage customer support tickets for a support team that uses Pylon.

Given a ticket's current state and its full message thread, decide whether it can be CLOSED, needs a FOLLOW_UP (internal work and/or a reply is owed), or needs a CONFIRMATION (work is already done, the customer just needs to be told).

Ground every factual claim about product behavior, configuration, or account setup ONLY in the "Internal knowledge" or "Compliance rules" excerpts below or in what the thread itself already states. If nothing grounds a claim, say so explicitly (e.g. "needs internal confirmation before we can tell the customer") instead of inventing it.

Never write a draft reply that claims something was done, fixed, or configured unless the thread already shows that it was. Draft replies should be concise, friendly, and ready to paste directly into a support tool as-is.

Respond with a JSON object containing these fields:
- verdict: "close" if nothing further is owed to the customer, "follow_up" if support owes internal work and/or a reply, "confirmation" if work is done and the customer just needs to be told.
- what_customer_needs: one or two sentences on what the customer is actually asking for or waiting on.
- why: one or two sentences explaining the verdict, grounded in the thread and/or internal knowledge/compliance rules. Keep it to plain prose — do not include any markup or field tags.
- needs_reply: true only if a customer-facing reply should be sent now.
- draft_reply: a ready-to-paste customer-facing reply when needs_reply is true, otherwise null.
- sources: an array of every source you relied on for the draft reply and verdict. Each item is an object {type, reference, url}: type is "thread" for a ticket message, "knowledge" for an internal Notion doc, "compliance" for a Hadrius compliance doc, "linear" for a related Linear ticket, or "pylon_kb" for a Pylon Knowledge Base article; reference is a short label (a doc/page title/rule description, or which message by who and when, or the Linear ticket ID); url is the doc/rule/ticket's URL when the knowledge/compliance/linear text provides one, otherwise null (thread sources are always null). CRITICAL: Do not label Linear tickets as "knowledge" - they must be labeled as "linear". Every factual claim in the draft reply must trace to a listed source. Cite only material actually shown to you below — never fabricate a title or URL. Use an empty array if there is no draft reply and you used nothing beyond the plain request.`;

export async function analyzeTicket(input: {
  title: string;
  number: number;
  state: string;
  messages: PylonMessage[];
  knowledge: string;
  compliance?: string;
  linear?: string;
  pylonKb?: string;
}): Promise<AnalysisResult> {
  const userContent = `Ticket #${input.number} — "${input.title}"
Current Pylon state: ${input.state}

Full message thread (oldest to newest):
${formatThread(input.messages)}

Internal knowledge (from Notion; may be empty if nothing relevant was found):
${input.knowledge || "(no matching internal documentation found)"}

Compliance rules (from Hadrius; may be empty if nothing relevant was found):
${input.compliance || "(no matching compliance rules found)"}

Related tickets (from Linear; may be empty if nothing relevant was found):
${input.linear || "(no related linear tickets found)"}

Pylon Knowledge Base (may be empty if no articles exist):
${input.pylonKb || "(no pylon knowledge base articles provided)"}`;

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

      const parsed = AnalysisResultSchema.safeParse(parsedJson);
      if (parsed.success) {
        const data = parsed.data;
        return {
          ...data,
          draft_reply: data.draft_reply ? data.draft_reply.replace(/\\n/g, "\n") : null,
          why: data.why ? data.why.replace(/\\n/g, "\n") : data.why,
          what_customer_needs: data.what_customer_needs ? data.what_customer_needs.replace(/\\n/g, "\n") : data.what_customer_needs,
        };
      }
      lastIssue = `model returned a malformed verdict (${parsed.error.issues[0]?.message ?? "invalid fields"})`;
    } catch (err) {
      throw classifyGeminiError(err);
    }
  }

  throw new Error(`Analysis failed after ${MAX_ATTEMPTS} attempts: ${lastIssue}`);
}
