"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { StatCards } from "@/components/StatCards";
import { FilterBar } from "@/components/FilterBar";
import { TicketTable } from "@/components/TicketTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SnoozeDialog } from "@/components/SnoozeDialog";
import { useToasts } from "@/components/ToastProvider";
import type { TicketDisposition } from "@/components/TicketRow";
import { friendlyError } from "@/lib/clientErrors";
import { formatDate } from "@/lib/format";
import type {
  AdminStatus,
  Analysis,
  AnalysisFailure,
  AnalysisRunStatus,
  AnalysisSource,
  DispositionAction,
  Ticket,
  Verdict,
} from "@/lib/types";

const PYLON_BASE_URL = process.env.NEXT_PUBLIC_PYLON_APP_URL ?? "https://app.usepylon.com";
const QUEUE_POLL_INTERVAL_MS = 2000;
const DISCLAIMER_DISMISSED_KEY = "pylon-triage:disclaimer-dismissed";

interface PendingClose {
  tickets: Ticket[];
  error: string | null;
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-500" />
  );
}

// Tiny external store around the localStorage dismissal flag, so the banner can read it without
// a hydration mismatch (the server snapshot renders it hidden until the client value is known).
let disclaimerListeners: Array<() => void> = [];
const disclaimerStore = {
  subscribe(listener: () => void) {
    disclaimerListeners.push(listener);
    return () => {
      disclaimerListeners = disclaimerListeners.filter((l) => l !== listener);
    };
  },
  isDismissed: () => localStorage.getItem(DISCLAIMER_DISMISSED_KEY) === "1",
  serverSnapshot: () => true,
  dismiss() {
    localStorage.setItem(DISCLAIMER_DISMISSED_KEY, "1");
    for (const listener of disclaimerListeners) listener();
  },
};

/** The standing draft/close caveat. Dismissible; the choice sticks via localStorage. */
function DisclaimerBanner() {
  const dismissed = useSyncExternalStore(
    disclaimerStore.subscribe,
    disclaimerStore.isDismissed,
    disclaimerStore.serverSnapshot,
  );

  if (dismissed) return null;
  return (
    <div className="relative rounded-xl border border-amber-200 bg-amber-50 py-3 pr-10 pl-4 text-sm text-amber-800">
      ⚠ Draft replies are for your review — Pylon has no API to send them, so copy/paste to actually send.
      Closing a ticket (single or bulk) is a real write to Pylon and asks for confirmation first.
      <button
        onClick={() => disclaimerStore.dismiss()}
        title="Dismiss (won't show again)"
        className="absolute top-2 right-2 rounded-md px-1.5 text-amber-500 hover:bg-amber-100 hover:text-amber-700"
      >
        ×
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { addToast } = useToasts();
  const [mcpStatus, setMcpStatus] = useState<{ pylon: boolean; notion: boolean; hadrius: boolean; linear: boolean } | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [failures, setFailures] = useState<Record<string, AnalysisFailure>>({});
  const [dispositions, setDispositions] = useState<Record<string, TicketDisposition>>({});
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [queueStatus, setQueueStatus] = useState<AnalysisRunStatus | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [syncPhase, setSyncPhase] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [adminFilter, setAdminFilter] = useState<AdminStatus[]>(["non_admin"]);
  const [verdictFilter, setVerdictFilter] = useState<Verdict[]>([]);
  const [sourceFilter, setSourceFilter] = useState<AnalysisSource["type"][]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showSnoozed, setShowSnoozed] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [snoozeTarget, setSnoozeTarget] = useState<Ticket | null>(null);
  const [snoozeBusy, setSnoozeBusy] = useState(false);

  const setAnalyzing = useCallback((id: string, value: boolean) => {
    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearFailure = useCallback((id: string) => {
    setFailures((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const recordFailure = useCallback((id: string, error: string) => {
    setFailures((prev) => ({
      ...prev,
      [id]: { ticket_id: id, last_activity_at: null, error, failed_at: new Date().toISOString() },
    }));
  }, []);

  // Single-ticket analysis (expand-to-analyze, per-row retry, re-analyze button): stays a direct
  // synchronous call because the result comes back in the same request — better than enqueue+poll
  // for one ticket. Batch work goes through the server-side queue below.
  const analyzeTicket = useCallback(
    async (id: string, force = false) => {
      setAnalyzing(id, true);
      try {
        const res = await fetch(`/api/tickets/${id}/analyze${force ? "?force=1" : ""}`, { method: "POST" });
        const data = await res.json();
        if (data.analysis) {
          setAnalyses((prev) => ({ ...prev, [id]: data.analysis }));
          clearFailure(id);
        } else {
          recordFailure(id, data.error ?? "Analysis returned no result");
        }
      } catch (err) {
        recordFailure(id, friendlyError(err, "Analysis request failed"));
      } finally {
        setAnalyzing(id, false);
      }
    },
    [setAnalyzing, clearFailure, recordFailure],
  );

  const loadStatus = useCallback(async (): Promise<{ pylon: boolean; notion: boolean; hadrius: boolean } | null> => {
    try {
      const res = await fetch("/api/mcp/status");
      const status = await res.json();
      setMcpStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const loadAnalyses = useCallback(async () => {
    const res = await fetch("/api/analyses");
    const data = await res.json();
    const map: Record<string, Analysis> = {};
    for (const row of data.analyses ?? []) map[row.ticket_id] = row;
    setAnalyses(map);
    const failureMap: Record<string, AnalysisFailure> = {};
    for (const row of data.failures ?? []) failureMap[row.ticket_id] = row;
    setFailures(failureMap);
    const dispositionMap: Record<string, TicketDisposition> = {};
    for (const row of data.dispositions ?? []) {
      dispositionMap[row.ticket_id] = { user_action: row.user_action, acted_at: row.acted_at };
    }
    setDispositions(dispositionMap);
  }, []);

  // ---------------------------------------------------------------------------
  // Server-side analysis queue: enqueue via POST /api/analyze-all, then poll GET
  // until the run drains. Finished jobs surface through /api/analyses.
  // ---------------------------------------------------------------------------

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  const lastFinishedRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollQueue = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch("/api/analyze-all");
      const status: AnalysisRunStatus = await res.json();
      setQueueStatus(status);

      const finished = status.counts.done + status.counts.failed;
      if (finished !== lastFinishedRef.current) {
        lastFinishedRef.current = finished;
        await loadAnalyses();
      }

      if (!status.active && status.counts.queued + status.counts.running === 0) {
        stopPolling();
        if (status.total > 0) {
          addToast(
            status.counts.failed > 0
              ? `Analysis run finished — ${status.counts.done} analyzed, ${status.counts.failed} failed (retry from the rows)`
              : `Analysis run finished — ${status.counts.done} ticket${status.counts.done === 1 ? "" : "s"} analyzed`,
            status.counts.failed > 0 ? "error" : "success",
          );
        }
      }
    } catch {
      // Transient poll failures are fine; the next tick retries.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [loadAnalyses, stopPolling, addToast]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(() => void pollQueue(), QUEUE_POLL_INTERVAL_MS);
  }, [pollQueue]);

  useEffect(() => stopPolling, [stopPolling]);

  /** Enqueues a server-side analysis run (all stale tickets when ids are omitted) and starts polling. */
  const enqueueAnalysis = useCallback(
    async (ids?: string[], force = false) => {
      try {
        const res = await fetch("/api/analyze-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ids && ids.length > 0 ? { ids, force } : { force }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to start the analysis run");
        const status: AnalysisRunStatus | undefined = data.status;
        if (status) {
          setQueueStatus(status);
          lastFinishedRef.current = status.counts.done + status.counts.failed;
          if (status.counts.queued + status.counts.running > 0) startPolling();
        }
      } catch (err) {
        addToast(friendlyError(err, "Failed to start the analysis run"), "error");
      }
    },
    [startPolling, addToast],
  );

  const runSync = useCallback(
    async (mode: "new" | "full") => {
      setLoadingTickets(true);
      setSyncError(null);
      try {
        setSyncPhase("Checking Pylon & Notion connections…");
        const status = await loadStatus();

        setSyncPhase(
          mode === "new"
            ? "Fetching tickets created since the last sync…"
            : "Re-scanning every open ticket in Pylon…",
        );
        const res = await fetch(`/api/tickets?mode=${mode}`);
        const data = await res.json();
        setTickets(data.tickets ?? []);
        if (data.error) setSyncError(data.error);

        setSyncPhase("Loading saved analyses…");
        await loadAnalyses();

        // Kick the server-side queue for anything stale (it also adopts jobs orphaned by a
        // dev-server restart). Skip when Pylon is disconnected — every job would just fail.
        if (status?.pylon) await enqueueAnalysis();
      } catch (err) {
        setSyncError(friendlyError(err, "Sync failed"));
      } finally {
        setSyncPhase(null);
        setLoadingTickets(false);
      }
    },
    [loadStatus, loadAnalyses, enqueueAnalysis],
  );

  const checkForNew = useCallback(() => runSync("new"), [runSync]);
  const fullRefresh = useCallback(() => runSync("full"), [runSync]);

  useEffect(() => {
    void checkForNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface the OAuth outcome the callback route encodes in the URL, then clean the params.
  // Deliberately window.location instead of useSearchParams(): the latter requires a Suspense
  // boundary for statically prerendered client pages in Next 16.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("mcp_connected");
    const mcpError = params.get("mcp_error");
    if (!connected && !mcpError) return;
    if (connected) {
      const label = connected.charAt(0).toUpperCase() + connected.slice(1);
      addToast(`${label} connected`, "success");
      void loadStatus();
    }
    if (mcpError) {
      addToast(`Connection failed: ${mcpError}`, "error");
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [addToast, loadStatus]);

  // Tickets currently being analyzed: manual single-ticket calls plus in-flight queue jobs.
  // Finished (done/failed) queue rows linger until the next enqueue, so only queued/running count.
  const analyzingSet = useMemo(() => {
    const set = new Set(analyzingIds);
    for (const job of queueStatus?.jobs ?? []) {
      if (job.status === "queued" || job.status === "running") set.add(job.ticket_id);
    }
    return set;
  }, [analyzingIds, queueStatus]);

  const queueBusy = Boolean(
    queueStatus && (queueStatus.active || queueStatus.counts.queued + queueStatus.counts.running > 0),
  );

  const availableStates = useMemo(() => {
    const states = new Set<string>();
    for (const t of tickets) if (t.state) states.add(t.state);
    return [...states].sort();
  }, [tickets]);

  const snoozedCount = useMemo(() => tickets.filter((t) => t.snoozed_until).length, [tickets]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const isSnoozed = Boolean(t.snoozed_until);
      if (showSnoozed ? !isSnoozed : isSnoozed) return false;
      if (adminFilter.length > 0 && !adminFilter.includes(t.admin_status)) return false;
      if (verdictFilter.length > 0) {
        const v = analyses[t.id]?.verdict;
        if (!v || !verdictFilter.includes(v)) return false;
      }
      if (sourceFilter.length > 0) {
        const sources = analyses[t.id]?.sources || [];
        // Support "thread" filter capturing tickets with only thread sources, or zero sources (as they relied on thread)
        const hasMatch = sourceFilter.some(sourceType => {
          if (sourceType === "thread") {
            return sources.length === 0 || sources.every(s => s.type === "thread" || s.type === "pylon");
          }
          // Handle backwards compatibility where pylon_kb might have been recorded as 'pylon'
          if (sourceType === "pylon_kb") {
             return sources.some(s => s.type === "pylon_kb" || s.type === "pylon");
          }
          return sources.some(s => s.type === sourceType);
        });
        if (!hasMatch) return false;
      }
      if (stateFilter.length > 0 && !stateFilter.includes(t.state)) return false;
      if (q) {
        const haystack = `${t.title} ${t.number} ${t.requester_name ?? ""} ${t.requester_email ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, adminFilter, verdictFilter, sourceFilter, stateFilter, search, analyses, showSnoozed]);

  const stats = useMemo(() => {
    // Snoozed tickets are deliberately deferred, so they don't count toward the live queue.
    const nonAdmin = tickets.filter((t) => t.admin_status === "non_admin" && !t.snoozed_until);
    const count = (verdict: Verdict) =>
      nonAdmin.filter((t) => analyses[t.id]?.verdict === verdict).length;
    const canClose = count("close");
    const needsFollowUp = count("follow_up");
    const needsConfirmation = count("confirmation");
    return {
      nonAdminTotal: nonAdmin.length,
      canClose,
      needsFollowUp,
      needsConfirmation,
      unclassified: nonAdmin.length - canClose - needsFollowUp - needsConfirmation,
    };
  }, [tickets, analyses]);

  const handleToggle = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
      if (!analyses[id] && !analyzingSet.has(id)) {
        analyzeTicket(id);
      }
    },
    [analyses, analyzingSet, analyzeTicket],
  );

  const handleSelectChange = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAllChange = useCallback(
    (selected: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const t of filteredTickets) {
          if (selected) next.add(t.id);
          else next.delete(t.id);
        }
        return next;
      });
    },
    [filteredTickets],
  );

  const requestCloseSingle = useCallback((ticket: Ticket) => {
    setPendingClose({ tickets: [ticket], error: null });
  }, []);

  const requestCloseBulk = useCallback(() => {
    const selected = tickets.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    setPendingClose({ tickets: selected, error: null });
  }, [tickets, selectedIds]);

  const reanalyzeSelected = useCallback(() => {
    const ids = tickets.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    if (ids.length === 0) return;
    void enqueueAnalysis(ids, true);
  }, [tickets, selectedIds, enqueueAnalysis]);

  const removeTicketsFromState = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setTickets((prev) => prev.filter((t) => !idSet.has(t.id)));
    setAnalyses((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    setExpandedId((prev) => (prev && idSet.has(prev) ? null : prev));
  }, []);

  const confirmClose = useCallback(async () => {
    if (!pendingClose) return;
    const ids = pendingClose.tickets.map((t) => t.id);
    setCloseBusy(true);
    setClosingIds((prev) => new Set([...prev, ...ids]));

    try {
      if (ids.length === 1) {
        const res = await fetch(`/api/tickets/${ids[0]}/close`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to close ticket");
        removeTicketsFromState(ids);
        setPendingClose(null);
        addToast(`Closed #${pendingClose.tickets[0].number} in Pylon`, "success");
      } else {
        const res = await fetch("/api/tickets/bulk-close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const data = await res.json();
        const succeeded: string[] = (data.results ?? []).filter((r: { closed: boolean }) => r.closed).map((r: { id: string }) => r.id);
        const failed = (data.results ?? []).filter((r: { closed: boolean }) => !r.closed);
        removeTicketsFromState(succeeded);
        if (succeeded.length > 0) {
          addToast(`Closed ${succeeded.length} ticket${succeeded.length === 1 ? "" : "s"} in Pylon`, "success");
        }
        if (failed.length > 0) {
          setPendingClose({
            tickets: pendingClose.tickets.filter((t) => failed.some((f: { id: string }) => f.id === t.id)),
            error: `${failed.length} ticket(s) failed to close: ${failed.map((f: { number: number | null; error?: string }) => `#${f.number} (${f.error})`).join(", ")}`,
          });
        } else {
          setPendingClose(null);
        }
      }
    } catch (err) {
      setPendingClose((prev) => (prev ? { ...prev, error: friendlyError(err, "Failed to close ticket") } : prev));
    } finally {
      setClosingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setCloseBusy(false);
    }
  }, [pendingClose, removeTicketsFromState, addToast]);

  const confirmSnooze = useCallback(
    async (snoozeUntil: string, reason: string | null) => {
      if (!snoozeTarget) return;
      const { id, number } = snoozeTarget;
      setSnoozeBusy(true);
      try {
        const res = await fetch(`/api/tickets/${id}/snooze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reason ? { snooze_until: snoozeUntil, reason } : { snooze_until: snoozeUntil }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to snooze ticket");
        // No read-only ticket endpoint exists (GET /api/tickets always syncs against Pylon),
        // so reflect the mutation locally instead of refetching.
        setTickets((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, snoozed_until: data.snoozed_until, snooze_reason: data.snooze_reason } : t,
          ),
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setExpandedId((prev) => (prev === id ? null : prev));
        setSnoozeTarget(null);
        addToast(`Snoozed #${number} until ${formatDate(data.snoozed_until)}`, "success");
      } catch (err) {
        addToast(friendlyError(err, "Failed to snooze ticket"), "error");
      } finally {
        setSnoozeBusy(false);
      }
    },
    [snoozeTarget, addToast],
  );

  const handleUnsnooze = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/tickets/${id}/snooze`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to unsnooze ticket");
        }
        setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, snoozed_until: null, snooze_reason: null } : t)));
        addToast("Snooze cleared — ticket is back in the queue", "success");
      } catch (err) {
        addToast(friendlyError(err, "Failed to unsnooze ticket"), "error");
      }
    },
    [addToast],
  );

  const handleDisposition = useCallback(
    async (id: string, action: DispositionAction) => {
      const previous = dispositions[id];
      // Optimistic: show the choice immediately, roll back if the write fails.
      setDispositions((prev) => ({ ...prev, [id]: { user_action: action, acted_at: new Date().toISOString() } }));
      try {
        const res = await fetch(`/api/tickets/${id}/disposition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_action: action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to record feedback");
        if (data.disposition) {
          setDispositions((prev) => ({
            ...prev,
            [id]: { user_action: data.disposition.user_action, acted_at: data.disposition.acted_at },
          }));
        }
      } catch (err) {
        setDispositions((prev) => {
          const next = { ...prev };
          if (previous) next[id] = previous;
          else delete next[id];
          return next;
        });
        addToast(friendlyError(err, "Failed to record feedback"), "error");
      }
    },
    [dispositions, addToast],
  );

  const handleAnalysisUpdated = useCallback((analysis: Analysis) => {
    setAnalyses((prev) => ({ ...prev, [analysis.ticket_id]: analysis }));
  }, []);

  const queueFinished = queueStatus ? queueStatus.counts.done + queueStatus.counts.failed : 0;

  return (
    <div className="min-h-screen bg-white px-8 py-8 text-zinc-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Open Ticket Queue</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Each non-admin ticket reviewed against its full thread · click a row for the verdict and draft reply
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ConnectionStatus status={mcpStatus} />
            <button
              onClick={checkForNew}
              disabled={loadingTickets}
              title="Only fetches tickets created since the last sync"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loadingTickets && (
                <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {loadingTickets ? "Syncing…" : "Check for new"}
            </button>
            <button
              onClick={fullRefresh}
              disabled={loadingTickets}
              title="Re-scans every open ticket, picks up state changes, and drops tickets closed elsewhere in Pylon"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loadingTickets && <Spinner />}
              {loadingTickets ? "Syncing…" : "Full refresh"}
            </button>
          </div>
        </header>

        {syncPhase && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <Spinner />
              <span>{syncPhase}</span>
            </div>
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className="animate-indeterminate absolute inset-y-0 rounded-full bg-indigo-500" />
            </div>
          </div>
        )}

        {mcpStatus && !mcpStatus.pylon && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Connect Pylon (top right) to load tickets. Nothing loads until you authorize access.
          </div>
        )}

        {syncError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {syncError}
          </div>
        )}

        <StatCards {...stats} />

        <DisclaimerBanner />

        {queueBusy && queueStatus && (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Spinner />
            <span>
              Analyzing {queueFinished} of {queueStatus.total} tickets…
            </span>
            {queueStatus.counts.failed > 0 && (
              <span className="text-rose-600">
                {queueStatus.counts.failed} {queueStatus.counts.failed === 1 ? "failure" : "failures"} so far — retry
                from the row.
              </span>
            )}
          </div>
        )}

        <FilterBar
          adminFilter={adminFilter}
          onAdminFilterChange={setAdminFilter}
          verdictFilter={verdictFilter}
          onVerdictFilterChange={setVerdictFilter}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          stateFilter={stateFilter}
          onStateFilterChange={setStateFilter}
          availableStates={availableStates}
          search={search}
          onSearchChange={setSearch}
        />

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              Showing {filteredTickets.length} of {tickets.length} tickets
            </span>
            {(snoozedCount > 0 || showSnoozed) && (
              <button
                onClick={() => setShowSnoozed((v) => !v)}
                title={showSnoozed ? "Back to the active queue" : "Show only snoozed tickets"}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                  showSnoozed
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
                }`}
              >
                {showSnoozed ? "← Back to queue" : `Snoozed (${snoozedCount})`}
              </button>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={reanalyzeSelected}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Re-analyze {selectedIds.size} selected
              </button>
              <button
                onClick={requestCloseBulk}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-100"
              >
                Close {selectedIds.size} selected ticket{selectedIds.size === 1 ? "" : "s"} in Pylon
              </button>
            </div>
          )}
        </div>

        <TicketTable
          tickets={filteredTickets}
          totalTickets={tickets.length}
          loading={loadingTickets}
          analyses={new Map(Object.entries(analyses))}
          failures={new Map(Object.entries(failures))}
          dispositions={new Map(Object.entries(dispositions))}
          analyzing={analyzingSet}
          expandedId={expandedId}
          onToggle={handleToggle}
          onRetry={(id) => analyzeTicket(id, true)}
          pylonBaseUrl={PYLON_BASE_URL}
          selectedIds={selectedIds}
          onSelectChange={handleSelectChange}
          onSelectAllChange={handleSelectAllChange}
          closingIds={closingIds}
          onRequestClose={requestCloseSingle}
          onRequestSnooze={setSnoozeTarget}
          onUnsnooze={handleUnsnooze}
          onDisposition={handleDisposition}
          onAnalysisUpdated={handleAnalysisUpdated}
        />
      </div>

      <ConfirmDialog
        open={pendingClose !== null}
        title={
          pendingClose && pendingClose.tickets.length === 1
            ? `Close ticket #${pendingClose.tickets[0].number} in Pylon?`
            : `Close ${pendingClose?.tickets.length ?? 0} tickets in Pylon?`
        }
        description="This sets the ticket state to closed directly in Pylon and records the triage reason on the ticket's “Reason for closing” field. This cannot be undone from here."
        items={pendingClose?.tickets.map((t) => `#${t.number} — ${t.title}`) ?? []}
        confirmLabel="Close in Pylon"
        busy={closeBusy}
        error={pendingClose?.error ?? null}
        onConfirm={confirmClose}
        onCancel={() => setPendingClose(null)}
      />

      <SnoozeDialog
        key={snoozeTarget?.id ?? "none"}
        ticket={snoozeTarget}
        busy={snoozeBusy}
        onConfirm={confirmSnooze}
        onCancel={() => setSnoozeTarget(null)}
      />
    </div>
  );
}
