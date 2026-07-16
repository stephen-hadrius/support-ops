import { NextRequest, NextResponse } from "next/server";
import { closeIssue } from "@/lib/mcp/pylon";
import { getTicket, removeTicket, getAnalysis, recordClosedTicket } from "@/lib/db";
import { buildCloseReason } from "@/lib/closeReason";
import { publicErrorMessage } from "@/lib/errors";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const baseUrl = req.nextUrl.origin;

  const ticket = getTicket(id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  try {
    await closeIssue(baseUrl, ticket.number, buildCloseReason(getAnalysis(id)));
  } catch (err) {
    console.error(`Failed to close ticket #${ticket.number}:`, err);
    return NextResponse.json({ error: publicErrorMessage(err, "Failed to close ticket in Pylon") }, { status: 502 });
  }

  // Capture the analytics row before removeTicket deletes the analysis it reads.
  recordClosedTicket(ticket, "dashboard", new Date().toISOString());
  removeTicket(id);
  return NextResponse.json({ closed: true, id });
}
