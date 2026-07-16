import type { Analysis, AnalysisFailure, DispositionAction, Ticket } from "@/lib/types";
import { TicketRow, type TicketDisposition } from "./TicketRow";

interface TicketTableProps {
  tickets: Ticket[];
  totalTickets: number;
  loading: boolean;
  analyses: Map<string, Analysis>;
  failures: Map<string, AnalysisFailure>;
  dispositions: Map<string, TicketDisposition>;
  analyzing: Set<string>;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onRetry: (id: string) => void;
  pylonBaseUrl: string;
  selectedIds: Set<string>;
  onSelectChange: (id: string, selected: boolean) => void;
  onSelectAllChange: (selected: boolean) => void;
  closingIds: Set<string>;
  onRequestClose: (ticket: Ticket) => void;
  onRequestSnooze: (ticket: Ticket) => void;
  onUnsnooze: (id: string) => void;
  onDisposition: (id: string, action: DispositionAction) => void;
  onAnalysisUpdated: (analysis: Analysis) => void;
}

const HEADERS = ["Ticket", "State", "Verdict", "Requester", "Title", "Created", "Last activity", "Idle"];

export function TicketTable({
  tickets,
  totalTickets,
  loading,
  analyses,
  failures,
  dispositions,
  analyzing,
  expandedId,
  onToggle,
  onRetry,
  pylonBaseUrl,
  selectedIds,
  onSelectChange,
  onSelectAllChange,
  closingIds,
  onRequestClose,
  onRequestSnooze,
  onUnsnooze,
  onDisposition,
  onAnalysisUpdated,
}: TicketTableProps) {
  if (tickets.length === 0) {
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-400">
          <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-500" />
          Loading tickets…
        </div>
      );
    }
    if (totalTickets === 0) {
      return (
        <div className="py-16 text-center text-sm text-zinc-400">
          No open tickets synced yet. Connect Pylon (top right) and use “Check for new” to load the queue.
        </div>
      );
    }
    return <div className="py-16 text-center text-sm text-zinc-400">No tickets match the current filters.</div>;
  }

  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500">
            <th className="py-3 pr-2 pl-4">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAllChange(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
              />
            </th>
            <th className="py-3 pr-2" />
            {HEADERS.map((header) => (
              <th key={header} className="py-3 pr-4">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              analysis={analyses.get(ticket.id)}
              failure={failures.get(ticket.id)}
              disposition={dispositions.get(ticket.id)}
              analyzing={analyzing.has(ticket.id)}
              expanded={expandedId === ticket.id}
              onToggle={() => onToggle(ticket.id)}
              onRetry={() => onRetry(ticket.id)}
              pylonBaseUrl={pylonBaseUrl}
              selected={selectedIds.has(ticket.id)}
              onSelectChange={(selected) => onSelectChange(ticket.id, selected)}
              closing={closingIds.has(ticket.id)}
              onRequestClose={onRequestClose}
              onRequestSnooze={onRequestSnooze}
              onUnsnooze={onUnsnooze}
              onDisposition={onDisposition}
              onAnalysisUpdated={onAnalysisUpdated}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
