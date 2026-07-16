import { randomUUID } from "crypto";
import { runAnalysisForTicket } from "./analysisRunner";
import {
  activeSnoozedIds,
  adoptOrphanedJobs,
  claimNextJob,
  clearFinishedJobs,
  enqueueJobs,
  finishJob,
  getAnalysis,
  listJobs,
  listTickets,
} from "./db";
import { publicErrorMessage } from "./errors";
import type { AnalysisRunStatus } from "./types";

const QUEUE_CONCURRENCY = 3;

// Job state lives in the analysis_jobs table (survives dev reloads and page refreshes, and is the
// dedupe source of truth via the ticket_id PK). Only the runner flag lives in memory — stashed on
// globalThis because Turbopack re-evaluates modules on edit, and a module-level `let` would let a
// second worker pool spawn alongside the first.
interface QueueState {
  active: boolean;
  runId: string | null;
}

const globalScope = globalThis as typeof globalThis & { __pylonAnalysisQueue?: QueueState };
const state = (globalScope.__pylonAnalysisQueue ??= { active: false, runId: null });

/** Non-admin, non-snoozed tickets whose analysis is missing or stale relative to last activity. */
export function staleTicketIds(): string[] {
  const snoozed = activeSnoozedIds();
  return listTickets()
    .filter((ticket) => {
      if (ticket.admin_status !== "non_admin") return false;
      if (snoozed.has(ticket.id)) return false;
      const cached = getAnalysis(ticket.id);
      return !cached || cached.last_activity_at !== ticket.last_activity_at;
    })
    .map((ticket) => ticket.id);
}

/**
 * Enqueues tickets for analysis. Idempotent: tickets already queued/running are left untouched.
 * When no run is active, finished rows from the previous run are cleared and any rows stuck in
 * 'running' (leftovers from a dead process) are re-queued into this run.
 */
export function enqueueAnalysisRun(ticketIds: string[], force: boolean): { runId: string; enqueued: number } {
  const runId = randomUUID();
  if (!state.active) {
    clearFinishedJobs();
    adoptOrphanedJobs(runId);
    state.runId = runId;
  }
  const enqueued = enqueueJobs(ticketIds, state.runId ?? runId, force, new Date().toISOString());
  return { runId: state.runId ?? runId, enqueued };
}

/** Starts the worker pool if it isn't already draining the queue. Safe to call repeatedly. */
export function ensureRunnerStarted(baseUrl: string): void {
  if (state.active) return;
  state.active = true;
  void runPool(baseUrl)
    .catch((err) => console.error("Analysis queue crashed:", err))
    .finally(() => {
      state.active = false;
      // Jobs enqueued in the shutdown window (after the workers saw an empty queue but before this
      // flag flipped) would otherwise strand until the next enqueue — restart for them.
      if (listJobs().some((job) => job.status === "queued")) {
        ensureRunnerStarted(baseUrl);
      }
    });
}

async function runPool(baseUrl: string): Promise<void> {
  await Promise.all(Array.from({ length: QUEUE_CONCURRENCY }, () => worker(baseUrl)));
}

async function worker(baseUrl: string): Promise<void> {
  for (;;) {
    const job = claimNextJob();
    if (!job) return;
    try {
      const outcome = await runAnalysisForTicket(baseUrl, job.ticket_id, Boolean(job.force));
      if (outcome.status === "failed") {
        finishJob(job.ticket_id, "failed", outcome.error, new Date().toISOString());
      } else if (outcome.status === "missing") {
        finishJob(job.ticket_id, "failed", "Ticket not found", new Date().toISOString());
      } else {
        finishJob(job.ticket_id, "done", null, new Date().toISOString());
      }
    } catch (err) {
      // runAnalysisForTicket handles its own failures; this only catches unexpected crashes.
      console.error(`Analysis job crashed for ticket ${job.ticket_id}:`, err);
      finishJob(job.ticket_id, "failed", publicErrorMessage(err, "Analysis crashed"), new Date().toISOString());
    }
  }
}

export function queueStatus(): AnalysisRunStatus {
  const jobs = listJobs();
  const counts = { queued: 0, running: 0, done: 0, failed: 0 };
  for (const job of jobs) counts[job.status]++;
  return {
    run_id: state.runId,
    active: state.active,
    total: jobs.length,
    counts,
    jobs: jobs.map((job) => ({ ticket_id: job.ticket_id, status: job.status })),
    failures: jobs.filter((job) => job.status === "failed").map((job) => ({ ticket_id: job.ticket_id, error: job.error })),
  };
}
