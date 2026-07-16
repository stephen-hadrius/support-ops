import type { Analysis, AnalysisFailure, DispositionAction, Ticket } from "@/lib/types";
import { OPEN_STATE_LABELS, VERDICT_LABELS } from "@/lib/types";
import { formatDate, idleDays } from "@/lib/format";
import { DraftReplyPanel } from "./DraftReplyPanel";

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

const DISPOSITION_OPTIONS: { key: DispositionAction; label: string; activeClass: string; title: string }[] = [
  {
    key: "agree",
    label: "Agree",
    activeClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
    title: "The verdict matches how you'll handle this ticket",
  },
  {
    key: "disagree",
    label: "Disagree",
    activeClass: "border-rose-300 bg-rose-50 text-rose-700",
    title: "The verdict is wrong",
  },
  {
    key: "override",
    label: "Override",
    activeClass: "border-amber-300 bg-amber-50 text-amber-700",
    title: "Handling this differently than suggested",
  },
];

function Badge({ text, className, title }: { text: string; className: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {text}
    </span>
  );
}

export interface TicketDisposition {
  user_action: DispositionAction;
  acted_at: string;
}

interface TicketRowProps {
  ticket: Ticket;
  analysis: Analysis | undefined;
  failure: AnalysisFailure | undefined;
  disposition: TicketDisposition | undefined;
  analyzing: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  pylonBaseUrl: string;
  selected: boolean;
  onSelectChange: (selected: boolean) => void;
  closing: boolean;
  onRequestClose: (ticket: Ticket) => void;
  onRequestSnooze: (ticket: Ticket) => void;
  onUnsnooze: (id: string) => void;
  onDisposition: (id: string, action: DispositionAction) => void;
  onAnalysisUpdated: (analysis: Analysis) => void;
}

export function TicketRow({
  ticket,
  analysis,
  failure,
  disposition,
  analyzing,
  expanded,
  onToggle,
  onRetry,
  pylonBaseUrl,
  selected,
  onSelectChange,
  closing,
  onRequestClose,
  onRequestSnooze,
  onUnsnooze,
  onDisposition,
  onAnalysisUpdated,
}: TicketRowProps) {
  const snoozed = Boolean(ticket.snoozed_until);
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-b border-zinc-100 text-sm hover:bg-zinc-50 ${closing ? "opacity-40" : ""}`}
      >
        <td className="py-3 pr-2 pl-4" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            disabled={closing}
            onChange={(e) => onSelectChange(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
          />
        </td>
        <td className="py-3 pr-2 text-zinc-400">
          <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>▸</span>
        </td>
        <td className="py-3 pr-4">
          <a
            href={`${pylonBaseUrl}/support/issues/views/all-issues?issueNumber=${ticket.number}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-indigo-600 hover:underline"
          >
            #{ticket.number}
          </a>
        </td>
        <td className="py-3 pr-4">
          <div className="flex flex-col items-start gap-1">
            <Badge
              text={OPEN_STATE_LABELS[ticket.state] ?? ticket.state}
              className={STATE_STYLES[ticket.state] ?? "border-zinc-200 bg-zinc-50 text-zinc-500"}
            />
            {snoozed && (
              <Badge
                text={`Snoozed until ${formatDate(ticket.snoozed_until)}`}
                title={ticket.snooze_reason ?? undefined}
                className="border-amber-200 bg-amber-50 text-amber-700"
              />
            )}
          </div>
        </td>
        <td className="py-3 pr-4">
          {analyzing ? (
            <span className="text-xs text-zinc-400">Analyzing…</span>
          ) : analysis ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge text={VERDICT_LABELS[analysis.verdict]} className={VERDICT_STYLES[analysis.verdict]} />
              {!analysis.grounded && (
                <Badge
                  text="Ungrounded"
                  title="No internal Notion or Hadrius documentation grounded this analysis — review with extra care"
                  className="border-amber-200 bg-amber-50 text-amber-700"
                />
              )}
            </div>
          ) : failure ? (
            <div className="flex items-center gap-2">
              <Badge text="Failed" className="border-rose-200 bg-rose-50 text-rose-700" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <span className="text-xs text-zinc-300">—</span>
          )}
        </td>
        <td className="py-3 pr-4">
          <div className="font-medium text-zinc-900">{ticket.requester_name ?? "Unknown"}</div>
          <div className="text-xs text-zinc-400">{ticket.requester_email}</div>
        </td>
        <td className="max-w-xs py-3 pr-4 text-zinc-700">{ticket.title}</td>
        <td className="py-3 pr-4 text-zinc-500">{formatDate(ticket.created_at)}</td>
        <td className="py-3 pr-4 text-zinc-500">{formatDate(ticket.last_activity_at)}</td>
        <td className="py-3 pr-4 text-zinc-500">{idleDays(ticket.last_activity_at)}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-zinc-100 bg-zinc-50/60">
          <td colSpan={10} className="p-5">
            {analyzing ? (
              <div className="py-6 text-center text-sm text-zinc-400">
                Analyzing ticket against the thread, Notion, and Hadrius knowledge bases…
              </div>
            ) : !analysis && failure ? (
              <div className="space-y-3 py-2">
                <div className="text-xs font-semibold tracking-wide text-rose-600 uppercase">Analysis failed</div>
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-mono text-xs break-words text-rose-700">
                  {failure.error}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                  }}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Retry analysis
                </button>
              </div>
            ) : !analysis ? (
              <div className="py-6 text-center text-sm text-zinc-400">Not yet analyzed.</div>
            ) : (
              <>
                {!analysis.grounded && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Not grounded in internal docs — the Notion and Hadrius knowledge searches returned nothing for this
                    ticket, so the verdict and draft rely on the thread alone. Review with extra care.
                  </div>
                )}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                      What the customer needs
                    </div>
                    <p className="mt-1 text-sm text-zinc-700">{analysis.what_customer_needs}</p>
                    <div className="mt-4 text-xs font-semibold tracking-wide text-zinc-400 uppercase">Why</div>
                    <p className="mt-1 text-sm text-zinc-700">{analysis.why}</p>
                    <div className="mt-4 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                      Verdict feedback
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {DISPOSITION_OPTIONS.map((option) => {
                        const active = disposition?.user_action === option.key;
                        return (
                          <button
                            key={option.key}
                            title={option.title}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDisposition(ticket.id, option.key);
                            }}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                              active
                                ? option.activeClass
                                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
                            }`}
                          >
                            {active ? `✓ ${option.label}` : option.label}
                          </button>
                        );
                      })}
                      {disposition && (
                        <span className="text-xs text-zinc-400">Recorded {formatDate(disposition.acted_at)}</span>
                      )}
                    </div>
                  </div>
                  <DraftReplyPanel
                    ticketId={ticket.id}
                    verdict={analysis.verdict}
                    draftReply={analysis.draft_reply}
                    editedDraft={analysis.edited_draft}
                    editedAt={analysis.edited_at}
                    sources={analysis.sources}
                    onSaved={onAnalysisUpdated}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetry();
                      }}
                      disabled={closing}
                      title="Re-run the analysis against the latest thread and knowledge base"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Re-analyze
                    </button>
                    {snoozed ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnsnooze(ticket.id);
                        }}
                        disabled={closing}
                        title="Clear the snooze and put this ticket back in the queue"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Unsnooze
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestSnooze(ticket);
                        }}
                        disabled={closing}
                        title="Hide this ticket from the queue until a later date"
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Snooze
                      </button>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestClose(ticket);
                    }}
                    disabled={closing}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {closing ? "Closing…" : "Close ticket in Pylon"}
                  </button>
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
