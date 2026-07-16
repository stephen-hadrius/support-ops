import { NextRequest, NextResponse } from "next/server";
import { closeIssue } from "@/lib/mcp/pylon";
import { getTicket, removeTicket, getAnalysis, recordClosedTicket } from "@/lib/db";
import { buildCloseReason } from "@/lib/closeReason";
import { runWithConcurrency } from "@/lib/concurrency";
import { publicErrorMessage } from "@/lib/errors";

const CLOSE_CONCURRENCY = 3;

interface CloseResult {
  id: string;
  number: number | null;
  closed: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No ticket ids provided" }, { status: 400 });
  }

  const results: CloseResult[] = [];

  await runWithConcurrency(ids, CLOSE_CONCURRENCY, async (id) => {
    const ticket = getTicket(id);
    if (!ticket) {
      results.push({ id, number: null, closed: false, error: "Ticket not found" });
      return;
    }
    try {
      await closeIssue(baseUrl, ticket.number, buildCloseReason(getAnalysis(id)));
      // Capture the analytics row before removeTicket deletes the analysis it reads.
      recordClosedTicket(ticket, "dashboard", new Date().toISOString());
      removeTicket(id);
      results.push({ id, number: ticket.number, closed: true });
    } catch (err) {
      console.error(`Failed to close ticket #${ticket.number}:`, err);
      results.push({ id, number: ticket.number, closed: false, error: publicErrorMessage(err, "Failed to close ticket in Pylon") });
    }
  });

  return NextResponse.json({ results });
}
