import { getAnalysis, getTicketMessages, listTickets } from "./db";
import type { AssigneeReport, DailyReport, ReportAction, ReportTicket, TicketMessage } from "./types";

/** A follow-up ticket with no customer-facing support reply for this many days counts as stale. */
export const STALE_DAYS = 3;

/** Ordering inside an assignee section: most urgent action first. */
const ACTION_PRIORITY: Record<ReportAction, number> = {
  follow_up: 0,
  confirmation: 1,
  close: 2,
  analyze: 3,
};

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((now - time) / (1000 * 60 * 60 * 24)));
}

/** Last customer-facing support message in the cached thread, if the thread has been fetched. */
function lastSupportReplyAt(ticketId: string): string | null {
  const row = getTicketMessages(ticketId);
  if (!row) return null;
  let latest: string | null = null;
  try {
    const messages = JSON.parse(row.messages_json) as TicketMessage[];
    if (!Array.isArray(messages)) return null;
    for (const message of messages) {
      if (message.from_customer || message.is_private || !message.sent_at) continue;
      if (!latest || message.sent_at > latest) latest = message.sent_at;
    }
  } catch {
    return null;
  }
  return latest;
}

function emptyCounts(): Record<ReportAction, number> {
  return { close: 0, follow_up: 0, confirmation: 0, analyze: 0 };
}

/**
 * Builds the daily team report from local data only (synced tickets, cached analyses and threads):
 * open non-admin tickets grouped by Pylon assignee, each flagged with the action it needs.
 */
export function buildDailyReport(): DailyReport {
  const now = Date.now();
  const tickets = listTickets().filter((t) => t.admin_status === "non_admin");
  const active = tickets.filter((t) => !t.snoozed_until);
  const snoozedCount = tickets.length - active.length;

  const byAssignee = new Map<string, ReportTicket[]>();
  const totals = emptyCounts();
  let totalStale = 0;

  for (const ticket of active) {
    let assignee = "Unassigned";
    let url: string | null = null;
    try {
      const raw = JSON.parse(ticket.raw_json) as {
        assignee?: { name?: string } | null;
        link?: string | null;
      };
      assignee = raw.assignee?.name?.trim() || "Unassigned";
      url = raw.link ?? null;
    } catch {
      // Malformed cache row — keep the Unassigned bucket.
    }

    const analysis = getAnalysis(ticket.id);
    const action: ReportAction = analysis ? (analysis.verdict as ReportAction) : "analyze";

    const idleDays = daysSince(ticket.last_activity_at, now);
    const supportReplyDays = daysSince(lastSupportReplyAt(ticket.id), now);
    // Staleness prefers "time since we last replied to the customer"; tickets whose thread was
    // never cached fall back to overall idle time.
    const waitingDays = supportReplyDays ?? idleDays;
    const stale = action === "follow_up" && waitingDays !== null && waitingDays >= STALE_DAYS;

    const reportTicket: ReportTicket = {
      number: ticket.number,
      title: ticket.title,
      state: ticket.state,
      url,
      requester_name: ticket.requester_name,
      action,
      stale,
      idle_days: idleDays,
      days_since_support_reply: supportReplyDays,
      has_draft: Boolean(analysis && (analysis.edited_draft ?? analysis.draft_reply)),
    };

    totals[action]++;
    if (stale) totalStale++;
    const bucket = byAssignee.get(assignee);
    if (bucket) bucket.push(reportTicket);
    else byAssignee.set(assignee, [reportTicket]);
  }

  const assignees: AssigneeReport[] = [...byAssignee.entries()].map(([assignee, list]) => {
    const counts = emptyCounts();
    let staleCount = 0;
    for (const t of list) {
      counts[t.action]++;
      if (t.stale) staleCount++;
    }
    list.sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? -1 : 1;
      if (a.action !== b.action) return ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action];
      return (b.days_since_support_reply ?? b.idle_days ?? 0) - (a.days_since_support_reply ?? a.idle_days ?? 0);
    });
    return { assignee, tickets: list, counts, stale_count: staleCount };
  });

  // Most urgent workloads first; the Unassigned bucket always sinks to the bottom.
  assignees.sort((a, b) => {
    if ((a.assignee === "Unassigned") !== (b.assignee === "Unassigned")) {
      return a.assignee === "Unassigned" ? 1 : -1;
    }
    if (a.stale_count !== b.stale_count) return b.stale_count - a.stale_count;
    return b.tickets.length - a.tickets.length;
  });

  return {
    generated_at: new Date(now).toISOString(),
    total: active.length,
    counts: totals,
    stale_count: totalStale,
    snoozed_count: snoozedCount,
    assignees,
  };
}
