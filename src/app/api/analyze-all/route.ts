import { NextRequest, NextResponse, after } from "next/server";
import { enqueueAnalysisRun, ensureRunnerStarted, queueStatus, staleTicketIds } from "@/lib/analysisQueue";
import { AnalyzeAllBodySchema } from "@/lib/schemas";

/**
 * Enqueues an analysis run. Body (optional): { force?: boolean, ids?: string[] }.
 * With no ids, every stale non-admin, non-snoozed ticket is enqueued. Safe to call repeatedly —
 * already-queued tickets are untouched and the response reflects the current run.
 */
export async function POST(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;
  const body = await req.json().catch(() => ({}));
  const parsed = AnalyzeAllBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
  }

  const { force = false, ids } = parsed.data;
  const ticketIds = ids && ids.length > 0 ? ids : staleTicketIds();
  const { runId, enqueued } = enqueueAnalysisRun(ticketIds, force);

  // Start the worker pool after the response is sent so the enqueue returns immediately.
  after(() => ensureRunnerStarted(baseUrl));

  return NextResponse.json({ run_id: runId, enqueued, status: queueStatus() }, { status: 202 });
}

/** Current queue snapshot — the dashboard polls this while a run is active. */
export async function GET() {
  return NextResponse.json(queueStatus());
}
