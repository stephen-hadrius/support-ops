import { NextResponse } from "next/server";
import { latestDispositions, listAnalyses, listAnalysisFailures, parseSources } from "@/lib/db";

export async function GET() {
  const analyses = listAnalyses().map((row) => ({ ...row, sources: parseSources(row.sources) }));
  return NextResponse.json({
    analyses,
    failures: listAnalysisFailures(),
    dispositions: latestDispositions(),
  });
}
