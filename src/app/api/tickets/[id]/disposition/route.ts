import { NextRequest, NextResponse } from "next/server";
import { getAnalysis, getTicket, recordDisposition } from "@/lib/db";
import { DispositionBodySchema } from "@/lib/schemas";

/** Records how the user acted on the AI verdict (append-only audit log; latest wins in the UI). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = DispositionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
  }

  const ticket = getTicket(id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  const analysis = getAnalysis(id);
  if (!analysis) {
    return NextResponse.json({ error: "Ticket has no analysis to give feedback on" }, { status: 409 });
  }

  const acted_at = new Date().toISOString();
  recordDisposition({
    ticket_id: id,
    ticket_number: ticket.number,
    ai_verdict: analysis.verdict,
    user_action: parsed.data.user_action,
    acted_at,
  });
  return NextResponse.json({ disposition: { ticket_id: id, user_action: parsed.data.user_action, acted_at } });
}
