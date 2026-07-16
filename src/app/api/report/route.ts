import { NextResponse } from "next/server";
import { buildDailyReport } from "@/lib/report";
import { publicErrorMessage } from "@/lib/errors";

/** Assembles the daily team report from local data (no Pylon or LLM calls — always fresh). */
export async function GET() {
  try {
    return NextResponse.json({ report: buildDailyReport() });
  } catch (err) {
    console.error("Daily report failed:", err);
    return NextResponse.json({ error: publicErrorMessage(err, "Failed to build the report") }, { status: 500 });
  }
}
