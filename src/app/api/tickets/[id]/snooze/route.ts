import { NextRequest, NextResponse } from "next/server";
import { clearSnooze, getTicket, setSnooze } from "@/lib/db";
import { SnoozeBodySchema } from "@/lib/schemas";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = SnoozeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
  }

  if (!getTicket(id)) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (Date.parse(parsed.data.snooze_until) <= Date.now()) {
    return NextResponse.json({ error: "snooze_until must be in the future" }, { status: 400 });
  }

  const snoozeReason = parsed.data.reason?.trim() || null;
  setSnooze(id, parsed.data.snooze_until, snoozeReason, new Date().toISOString());
  return NextResponse.json({ snoozed_until: parsed.data.snooze_until, snooze_reason: snoozeReason });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  clearSnooze(id);
  return NextResponse.json({ ok: true });
}
