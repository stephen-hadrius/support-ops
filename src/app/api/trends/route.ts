import { NextResponse } from "next/server";
import { getLatestTrendReport, saveTrendReport } from "@/lib/db";
import { generateTrendReport } from "@/lib/trends";
import { publicErrorMessage } from "@/lib/errors";
import type { TrendReport } from "@/lib/types";

function toReport(row: { generated_at: string; ticket_count: number; trends_json: string }): TrendReport {
  let trends: TrendReport["trends"] = [];
  try {
    const parsed = JSON.parse(row.trends_json);
    if (Array.isArray(parsed)) trends = parsed;
  } catch {
    // Corrupt cache row — serve an empty report rather than failing the page.
  }
  return { generated_at: row.generated_at, ticket_count: row.ticket_count, trends };
}

/** Latest cached trend report, or { report: null } if none has been generated yet. */
export async function GET() {
  const row = getLatestTrendReport();
  return NextResponse.json({ report: row ? toReport(row) : null });
}

/** Runs a fresh trend-spotting pass over the current queue and caches the result. */
export async function POST() {
  try {
    const report = await generateTrendReport();
    saveTrendReport(report.generated_at, report.ticket_count, JSON.stringify(report.trends));
    return NextResponse.json({ report });
  } catch (err) {
    console.error("Trend analysis failed:", err);
    return NextResponse.json({ error: publicErrorMessage(err, "Trend analysis failed") }, { status: 502 });
  }
}
