import { NextRequest, NextResponse } from "next/server";
import { getAnalysis, saveEditedDraft, toAnalysis } from "@/lib/db";
import { DraftPatchBodySchema } from "@/lib/schemas";

/** Persists (or clears, with edited_draft: null) the user's edit to a draft reply. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = DraftPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
  }

  if (!saveEditedDraft(id, parsed.data.edited_draft, new Date().toISOString())) {
    return NextResponse.json({ error: "No analysis exists for this ticket" }, { status: 404 });
  }

  const row = getAnalysis(id);
  return NextResponse.json({ analysis: row ? toAnalysis(row) : null });
}
