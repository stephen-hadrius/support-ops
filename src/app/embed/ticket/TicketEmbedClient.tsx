"use client";

import { useState } from "react";
import { DraftReplyPanel } from "@/components/DraftReplyPanel";
import { VERDICT_LABELS } from "@/lib/types";

export function TicketEmbedClient({ ticket, initialAnalysis }: { ticket: any, initialAnalysis: any }) {
  const [analysis, setAnalysis] = useState(initialAnalysis);

  const VERDICT_STYLES: Record<string, string> = {
    close: "bg-emerald-50 text-emerald-700 border-emerald-200",
    follow_up: "bg-rose-50 text-rose-700 border-rose-200",
    confirmation: "bg-violet-50 text-violet-700 border-violet-200",
  };

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3">
        <h2 className="text-lg font-semibold text-zinc-900">AI Triage Insights</h2>
        {analysis?.verdict && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${VERDICT_STYLES[analysis.verdict]}`}>
            {VERDICT_LABELS[analysis.verdict as keyof typeof VERDICT_LABELS]}
          </span>
        )}
      </div>

      {!analysis ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
          This ticket has not been analyzed yet.
        </div>
      ) : (
        <div className="space-y-4">
          {!analysis.grounded && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Not grounded in internal docs — the AI relied on the thread alone. Review carefully.
            </div>
          )}
          
          <div>
            <div className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">What the customer needs</div>
            <p className="mt-1 text-sm text-zinc-700 leading-relaxed">{analysis.what_customer_needs}</p>
          </div>
          
          <div>
            <div className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Why (Reasoning)</div>
            <p className="mt-1 text-sm text-zinc-700 leading-relaxed">{analysis.why}</p>
          </div>

          <div className="pt-2">
            <DraftReplyPanel
              ticketId={ticket.id}
              verdict={analysis.verdict}
              draftReply={analysis.draft_reply}
              editedDraft={analysis.edited_draft}
              editedAt={analysis.edited_at}
              sources={analysis.sources ? (typeof analysis.sources === 'string' ? JSON.parse(analysis.sources) : analysis.sources) : []}
              onSaved={(newAnalysis) => setAnalysis(newAnalysis)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
