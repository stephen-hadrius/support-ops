"use client";

import { useState, useMemo } from "react";
import { VERDICT_LABELS, OPEN_STATE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/format";

const STATE_STYLES: Record<string, string> = {
  new: "bg-sky-50 text-sky-700 border-sky-200",
  waiting_on_you: "bg-amber-50 text-amber-700 border-amber-200",
  waiting_on_customer: "bg-zinc-50 text-zinc-500 border-zinc-200",
  on_hold: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

const VERDICT_STYLES: Record<string, string> = {
  close: "bg-emerald-50 text-emerald-700 border-emerald-200",
  follow_up: "bg-rose-50 text-rose-700 border-rose-200",
  confirmation: "bg-violet-50 text-violet-700 border-violet-200",
};

export function AccountEmbedClient({ tickets, account_id }: { tickets: Array<{ ticket: any, analysis: any }>, account_id: string }) {
  const [activeTab, setActiveTab] = useState<"queue" | "analytics">("queue");

  const stats = useMemo(() => {
    const canClose = tickets.filter(t => t.analysis?.verdict === "close").length;
    const needsFollowUp = tickets.filter(t => t.analysis?.verdict === "follow_up").length;
    const needsConfirmation = tickets.filter(t => t.analysis?.verdict === "confirmation").length;
    
    return {
      total: tickets.length,
      canClose,
      needsFollowUp,
      needsConfirmation
    };
  }, [tickets]);

  if (tickets.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-zinc-500">
        No open tickets found for this account in the Support Ops dashboard.
        <br/><br/>
        <span className="text-xs text-zinc-400 font-mono">Debug Account ID: {account_id}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <div className="bg-white border-b border-zinc-200 px-4 pt-4 sticky top-0 z-10">
        <div className="flex gap-6">
          <button 
            onClick={() => setActiveTab("queue")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'queue' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'}`}
          >
            Ticket Queue ({tickets.length})
          </button>
          <button 
            onClick={() => setActiveTab("analytics")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'}`}
          >
            Analytics
          </button>
        </div>
      </div>

      <div className="p-4 flex-1">
        {activeTab === "queue" && (
          <div className="flex flex-col gap-3">
            {tickets.map(({ ticket, analysis }) => {
              const stateLabel = OPEN_STATE_LABELS[ticket.state] || ticket.state;
              const stateClass = STATE_STYLES[ticket.state] || "bg-zinc-50 text-zinc-500 border-zinc-200";
              
              return (
                <div key={ticket.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">#{ticket.number}</span>
                      <span className="text-sm font-medium text-zinc-700 truncate max-w-[200px]" title={ticket.title}>{ticket.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${stateClass}`}>
                        {stateLabel}
                      </span>
                      {analysis?.verdict && (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${VERDICT_STYLES[analysis.verdict]}`}>
                          {VERDICT_LABELS[analysis.verdict as keyof typeof VERDICT_LABELS]}
                        </span>
                      )}
                    </div>
                  </div>

                  {analysis ? (
                    <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Needs</span>
                        <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2" title={analysis.what_customer_needs}>{analysis.what_customer_needs}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Context</span>
                        <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2" title={analysis.why}>{analysis.why}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
                      Not analyzed yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-medium text-zinc-500">Open Tickets</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-900">{stats.total}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
              <div className="text-sm font-medium text-rose-700">Needs Follow-up</div>
              <div className="mt-2 text-3xl font-semibold text-rose-700">{stats.needsFollowUp}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <div className="text-sm font-medium text-emerald-700">Ready to Close</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-700">{stats.canClose}</div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
              <div className="text-sm font-medium text-violet-700">Needs Confirmation</div>
              <div className="mt-2 text-3xl font-semibold text-violet-700">{stats.needsConfirmation}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
