import { NextRequest, NextResponse } from "next/server";
import {
  searchOpenIssues,
  getIssueDetail,
  getContact,
  classifyAdminStatus,
  type PylonContact,
} from "@/lib/mcp/pylon";
import {
  upsertTicket,
  getTicket,
  getLatestCreatedAt,
  listTickets,
  listAllTicketIds,
  removeTicket,
  recordClosedTicket,
} from "@/lib/db";
import { runWithConcurrency } from "@/lib/concurrency";
import { publicErrorMessage } from "@/lib/errors";

const SYNC_CONCURRENCY = 3;

export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;
  const mode = req.nextUrl.searchParams.get("mode") === "full" ? "full" : "new";
  let failures = 0;
  let fatalError: string | null = null;

  try {
    // "new" mode only pages through tickets created since the newest one we've already synced —
    // cheap and skips re-checking everything already in the DB. "full" re-scans every open ticket
    // so state changes on existing tickets (e.g. new→waiting_on_you) get picked up too.
    const createdAfter = mode === "new" ? (getLatestCreatedAt() ?? undefined) : undefined;
    const summaries = await searchOpenIssues(baseUrl, createdAfter);
    const contactCache = new Map<string, PylonContact>();

    await runWithConcurrency(summaries, SYNC_CONCURRENCY, async (summary) => {
      try {
        const existing = getTicket(summary.id);
        const summaryActivity = summary.latest_message_time ?? summary.created_at ?? null;
        if (existing && existing.state === summary.state && existing.last_activity_at === summaryActivity) {
          return; // nothing has changed since the last sync; skip the extra get_issue/get_contact calls
        }

        const detail = await getIssueDetail(baseUrl, summary.number);
        const contactId = detail.requester?.id;
        let contact = contactId ? contactCache.get(contactId) : undefined;
        if (contactId && !contact) {
          contact = await getContact(baseUrl, contactId);
          contactCache.set(contactId, contact);
        }

        upsertTicket({
          id: detail.id,
          number: detail.number,
          title: detail.title,
          state: detail.state,
          admin_status: classifyAdminStatus(contact),
          requester_name: detail.requester?.name ?? null,
          requester_email: detail.requester?.email ?? null,
          created_at: detail.created_at ?? null,
          last_activity_at: detail.latest_message_time ?? detail.updated_at ?? detail.created_at ?? null,
          raw_json: JSON.stringify(detail),
        });
      } catch (err) {
        // One ticket hitting a persistent rate limit shouldn't abort the rest of the sync batch.
        failures++;
        console.error(`Failed to sync ticket #${summary.number}:`, err);
      }
    });

    // A full refresh returns every currently-open ticket, so we can reconcile: any locally-stored
    // ticket Pylon no longer lists as open has been closed/resolved elsewhere. Drop it so the
    // dashboard stops showing a stale "open" row (with an outdated state) for an already-closed ticket.
    // "new" mode only fetches recently-created tickets, so it can't distinguish closed from unfetched — never prune there.
    if (mode === "full") {
      const openIds = new Set(summaries.map((s) => s.id));
      const closedAt = new Date().toISOString();
      let pruned = 0;
      for (const id of listAllTicketIds()) {
        if (!openIds.has(id)) {
          // Keep the analytics history row (with the AI verdict, read before removeTicket deletes it)
          // for tickets that were closed outside this dashboard.
          const ticket = getTicket(id);
          if (ticket) recordClosedTicket(ticket, "external", closedAt);
          removeTicket(id);
          pruned++;
        }
      }
      if (pruned > 0) console.log(`Pruned ${pruned} ticket(s) no longer open in Pylon`);
    }
  } catch (err) {
    console.error("Ticket sync failed:", err);
    fatalError = publicErrorMessage(err, "Ticket sync failed");
  }

  const tickets = listTickets();
  if (fatalError) {
    return NextResponse.json({ error: fatalError, tickets }, { status: 502 });
  }
  if (failures > 0) {
    return NextResponse.json({ error: `${failures} ticket(s) failed to sync; showing cached data for those.`, tickets });
  }
  return NextResponse.json({ tickets });
}
