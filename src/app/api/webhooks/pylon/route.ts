import { NextRequest, NextResponse } from "next/server";
import { runAnalysisForTicket } from "@/lib/analysisRunner";
import { callTool } from "@/lib/mcp/client";
import { getAnalysis } from "@/lib/db";

// Pylon usually sends webhook payloads like: { event: "issue.created", data: { issue: { id: "...", number: 1234 } } }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const baseUrl = req.nextUrl.origin;
    
    // We only care about tickets being created or new messages arriving
    if (body.event !== "issue.created" && body.event !== "message.created") {
      return NextResponse.json({ received: true, ignored: true });
    }

    const issueId = body.data?.issue?.id || body.issue_id;
    if (!issueId) {
      return NextResponse.json({ error: "No issue ID found in payload" }, { status: 400 });
    }

    // 1. Run the full autonomous analysis (thread + Notion + Hadrius + Linear)
    console.log(`[Webhook] Running autonomous analysis for issue ${issueId}...`);
    const outcome = await runAnalysisForTicket(baseUrl, issueId, true);
    
    if (outcome.status === "failed") {
      return NextResponse.json({ error: outcome.error }, { status: 500 });
    }

    // 2. Fetch the newly saved analysis to get the draft and verdict
    const analysis = getAnalysis(issueId);
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found after generation" }, { status: 500 });
    }

    // 3. Push it back to Pylon as an internal note
    // Note: Since Pylon's MCP doesn't natively expose an `add_internal_note` tool yet, 
    // we use `update_issue` to write the draft reply directly to a dedicated Custom Field 
    // that your support team can see right inside the Pylon UI pane.
    if (analysis.draft_reply) {
      const internalNote = `[AI Triage - ${analysis.verdict.toUpperCase()}]\n\nDraft Reply:\n${analysis.draft_reply}`;
      
      console.log(`[Webhook] Pushing draft reply to Pylon for issue ${issueId}...`);
      await callTool("pylon", baseUrl, "update_issue", {
        issue_id: issueId,
        custom_fields: {
          // You'll need to create a text custom field in Pylon with this exact slug
          "ai_triage_note": internalNote
        }
      });
    }

    return NextResponse.json({ success: true, analyzed: true });
  } catch (error: any) {
    console.error("[Webhook Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
