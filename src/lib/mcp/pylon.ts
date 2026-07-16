import { z } from "zod";
import { callTool, parseToolResult } from "./client";
import {
  IssueMessagesSchema,
  PylonContactSchema,
  PylonIssueDetailSchema,
  PylonIssueSummarySchema,
  PylonMessageSchema,
  SearchIssuesPageSchema,
} from "../schemas";

// Shapes are derived from the zod schemas that validate them at the MCP boundary; all are
// passthrough, so unknown upstream fields stay accessible via the index signature.
export type PylonIssueSummary = z.infer<typeof PylonIssueSummarySchema>;
export type PylonIssueDetail = z.infer<typeof PylonIssueDetailSchema>;
export type PylonContact = z.infer<typeof PylonContactSchema>;
export type PylonMessage = z.infer<typeof PylonMessageSchema>;

/**
 * Pages through search_issues, excluding closed tickets, and returns every open issue summary.
 * Pass createdAfter to only page through tickets created since that time (a cheap "new tickets only" scan).
 */
export async function searchOpenIssues(baseUrl: string, createdAfter?: string): Promise<PylonIssueSummary[]> {
  const all: PylonIssueSummary[] = [];
  let cursor: string | undefined;

  for (;;) {
    const result = await callTool("pylon", baseUrl, "search_issues", {
      limit: 100,
      states_not_in: ["closed"],
      ...(createdAfter ? { created_after: createdAfter } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const page = parseToolResult(result, SearchIssuesPageSchema, "pylon.search_issues");
    all.push(...page.issues);
    if (!page.has_next_page || !page.cursor) break;
    cursor = page.cursor;
  }

  return all;
}

export async function getIssueDetail(baseUrl: string, issueNumberOrId: string | number): Promise<PylonIssueDetail> {
  const result = await callTool("pylon", baseUrl, "get_issue", { issue: String(issueNumberOrId) });
  return parseToolResult(result, PylonIssueDetailSchema, "pylon.get_issue");
}

export async function getContact(baseUrl: string, contactId: string): Promise<PylonContact> {
  const result = await callTool("pylon", baseUrl, "get_contact", { contact: contactId });
  return parseToolResult(result, PylonContactSchema, "pylon.get_contact");
}

export async function getIssueMessages(baseUrl: string, issueNumberOrId: string | number): Promise<PylonMessage[]> {
  const result = await callTool("pylon", baseUrl, "get_issue_messages", { issue: String(issueNumberOrId) });
  const parsed = parseToolResult(result, IssueMessagesSchema, "pylon.get_issue_messages");
  return Array.isArray(parsed) ? parsed : parsed.messages ?? [];
}

// Text custom field (object type: issue) the close reason is written to. Override via env if the
// slug differs in a given workspace.
const CLOSE_REASON_FIELD = process.env.PYLON_CLOSE_REASON_FIELD ?? "reason_for_closing";

/**
 * Sets an issue's state to "closed" via update_issue. This is a real write to Pylon.
 * When a reason is supplied it's recorded in the same call to the close-reason custom field,
 * so state and note move together atomically.
 */
export async function closeIssue(
  baseUrl: string,
  issueNumberOrId: string | number,
  reason?: string | null,
): Promise<void> {
  const args: Record<string, unknown> = {
    issue_id: String(issueNumberOrId),
    state: "closed",
  };
  if (reason?.trim()) {
    args.custom_fields = { [CLOSE_REASON_FIELD]: reason.trim() };
  }
  await callTool("pylon", baseUrl, "update_issue", args);
}

function readCustomFieldValue(customFields: unknown, slug: string): unknown {
  if (!customFields || typeof customFields !== "object") return undefined;
  const raw = (customFields as Record<string, unknown>)[slug];
  if (raw == null) return undefined;
  if (typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>).value;
  }
  return raw;
}

export type AdminStatus = "admin" | "non_admin" | "unknown";

/** Reads the "is_admin" custom field off a contact. Missing/unset/empty-string counts as "unknown". */
export function classifyAdminStatus(contact: PylonContact | undefined): AdminStatus {
  const raw = readCustomFieldValue(contact?.custom_fields, "is_admin");
  if (raw === true || raw === "true") return "admin";
  if (raw === false || raw === "false") return "non_admin";
  return "unknown";
}
