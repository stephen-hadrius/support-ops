import { NextRequest, NextResponse } from "next/server";
import { runAnalysisForTicket } from "@/lib/analysisRunner";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const baseUrl = req.nextUrl.origin;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const outcome = await runAnalysisForTicket(baseUrl, id, force);
  switch (outcome.status) {
    case "missing":
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    case "cached":
      return NextResponse.json({ analysis: outcome.analysis, cached: true });
    case "analyzed":
      return NextResponse.json({ analysis: outcome.analysis, cached: false });
    case "failed":
      return NextResponse.json({ error: outcome.error }, { status: 502 });
  }
}
