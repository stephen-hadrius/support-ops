import { z } from "zod";

// ---------------------------------------------------------------------------
// Claude verdict (structured tool output)
// ---------------------------------------------------------------------------

export const AnalysisSourceSchema = z.object({
  type: z.enum(["thread", "knowledge", "compliance", "linear"]),
  reference: z.string(),
  url: z.string().nullable(),
});

export const AnalysisResultSchema = z.object({
  verdict: z.enum(["close", "follow_up", "confirmation"]),
  what_customer_needs: z.string(),
  // Reject the known failure mode where the model serializes its remaining tool args as XML text
  // inside `why` (see the schema comment in analyze.ts).
  why: z
    .string()
    .refine((v) => !/<\/?(why|needs_reply|draft_reply|sources|invoke)>/i.test(v), {
      message: "field tags leaked into `why`",
    }),
  needs_reply: z.boolean(),
  draft_reply: z.string().nullable(),
  sources: z.array(AnalysisSourceSchema),
});

// ---------------------------------------------------------------------------
// Pylon MCP payloads. All passthrough: Pylon returns more fields than we model,
// and callers keep access to them via index signatures.
// ---------------------------------------------------------------------------

export const PylonIssueSummarySchema = z
  .object({
    id: z.string(),
    number: z.number(),
    title: z.string(),
    state: z.string(),
    created_at: z.string(),
    latest_message_time: z.string().optional(),
  })
  .passthrough();

export const PylonContactRefSchema = z
  .object({
    id: z.string(),
    email: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const PylonIssueDetailSchema = PylonIssueSummarySchema.extend({
  updated_at: z.string().optional(),
  requester: PylonContactRefSchema.optional(),
  custom_fields: z.record(z.unknown()).optional(),
}).passthrough();

export const PylonContactSchema = z
  .object({
    id: z.string(),
    email: z.string().optional(),
    name: z.string().optional(),
    custom_fields: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const PylonMessageSchema = z
  .object({
    id: z.string(),
    body_html: z.string().optional(),
    is_private: z.boolean().optional(),
    from_customer: z.boolean().optional(),
    sent_at: z.string().optional(),
  })
  .passthrough();

export const SearchIssuesPageSchema = z
  .object({
    issues: z.array(PylonIssueSummarySchema).default([]),
    count: z.number().optional(),
    cursor: z.string().optional(),
    has_next_page: z.boolean().optional(),
  })
  .passthrough();

/** get_issue_messages returns either a bare array or an object wrapping one. */
export const IssueMessagesSchema = z.union([
  z.array(PylonMessageSchema),
  z.object({ messages: z.array(PylonMessageSchema).optional() }).passthrough(),
]);

// ---------------------------------------------------------------------------
// API request bodies
// ---------------------------------------------------------------------------

export const BulkCloseBodySchema = z.object({
  ids: z.array(z.string()).min(1, "No ticket ids provided"),
});

export const AnalyzeAllBodySchema = z.object({
  force: z.boolean().optional(),
  ids: z.array(z.string()).optional(),
});

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "must be an ISO date string",
});

export const SnoozeBodySchema = z.object({
  snooze_until: isoDate,
  reason: z.string().max(500).optional(),
});

export const DispositionBodySchema = z.object({
  user_action: z.enum(["agree", "disagree", "override"]),
});

export const DraftPatchBodySchema = z.object({
  edited_draft: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Trend spotting (structured tool output, mirroring AnalysisResultSchema)
// ---------------------------------------------------------------------------

// The model sometimes emits arrays as strings ('"[1,2]"' or '#12, #34') inside tool args, so both
// array fields coerce from strings instead of failing the whole report.
const ticketNumberArray = z.preprocess((v) => {
  if (typeof v === "string") return v.match(/\d+/g)?.map(Number) ?? [];
  if (Array.isArray(v)) {
    return v.map((n) => (typeof n === "string" ? Number(n.replace(/\D/g, "")) : n)).filter((n) => Number.isFinite(n));
  }
  return v;
}, z.array(z.number()));

export const TrendSchema = z.object({
  title: z.string(),
  summary: z.string(),
  impact: z.enum(["low", "medium", "high"]),
  ticket_numbers: ticketNumberArray,
  suggested_action: z.string().nullable(),
});

export const TrendsResultSchema = z.object({
  // Observed double-wrapping: trends arrives as a JSON string that itself contains
  // {"trends": [...]}. Parse strings and unwrap nested {trends} objects until an array emerges.
  trends: z.preprocess((v) => {
    let value: unknown = v;
    for (let i = 0; i < 3; i++) {
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
          continue;
        } catch {
          return value;
        }
      }
      if (value && typeof value === "object" && !Array.isArray(value) && "trends" in value) {
        value = (value as { trends: unknown }).trends;
        continue;
      }
      break;
    }
    return value;
  }, z.array(TrendSchema)),
});
