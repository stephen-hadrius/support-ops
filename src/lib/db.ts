import Database from "better-sqlite3";
import path from "path";
import type { AdminStatus } from "./mcp/pylon";
import type { AnalysisResult, AnalysisSource } from "./analyze";
import type { Analysis } from "./types";

// ---------------------------------------------------------------------------
// Migrations. Versioned via PRAGMA user_version: each entry runs once, in order,
// inside a transaction. v1 is the historical baseline and must stay a no-op on
// databases created before the ladder existed (hence CREATE IF NOT EXISTS and
// the conditional `sources` column, which used to be an ad-hoc migration).
// ---------------------------------------------------------------------------

const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // v1 — baseline
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        state TEXT NOT NULL,
        admin_status TEXT NOT NULL,
        requester_name TEXT,
        requester_email TEXT,
        created_at TEXT,
        last_activity_at TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS analyses (
        ticket_id TEXT PRIMARY KEY,
        last_activity_at TEXT,
        verdict TEXT NOT NULL,
        what_customer_needs TEXT NOT NULL,
        why TEXT NOT NULL,
        needs_reply INTEGER NOT NULL,
        draft_reply TEXT,
        computed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analysis_failures (
        ticket_id TEXT PRIMARY KEY,
        last_activity_at TEXT,
        error TEXT NOT NULL,
        failed_at TEXT NOT NULL
      );
    `);
    const columns = (db.prepare("PRAGMA table_info(analyses)").all() as { name: string }[]).map((c) => c.name);
    if (!columns.includes("sources")) {
      db.exec("ALTER TABLE analyses ADD COLUMN sources TEXT");
    }
  },
  // v2 — analysis extensions: grounding flag + persisted user edits to the draft reply
  (db) => {
    db.exec(`
      ALTER TABLE analyses ADD COLUMN grounded INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE analyses ADD COLUMN edited_draft TEXT;
      ALTER TABLE analyses ADD COLUMN edited_at TEXT;
    `);
  },
  // v3 — verdict dispositions (agree/disagree tracking) + snoozes
  (db) => {
    db.exec(`
      CREATE TABLE dispositions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        ticket_number INTEGER,
        ai_verdict TEXT,
        user_action TEXT NOT NULL CHECK (user_action IN ('agree','disagree','override')),
        acted_at TEXT NOT NULL
      );
      CREATE INDEX idx_dispositions_ticket ON dispositions(ticket_id);

      CREATE TABLE snoozes (
        ticket_id TEXT PRIMARY KEY,
        snooze_until TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );
    `);
  },
  // v4 — cached message threads (one row per ticket, whole thread as JSON)
  (db) => {
    db.exec(`
      CREATE TABLE ticket_messages (
        ticket_id TEXT PRIMARY KEY,
        last_activity_at TEXT,
        messages_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
    `);
  },
  // v5 — history of closed tickets (tickets rows are deleted on close; this keeps analytics data)
  (db) => {
    db.exec(`
      CREATE TABLE closed_tickets (
        ticket_id TEXT NOT NULL,
        number INTEGER,
        title TEXT,
        requester_email TEXT,
        ai_verdict TEXT,
        grounded INTEGER,
        closed_via TEXT NOT NULL CHECK (closed_via IN ('dashboard','external')),
        created_at TEXT,
        closed_at TEXT NOT NULL,
        PRIMARY KEY (ticket_id, closed_at)
      );
    `);
  },
  // v6 — server-side analysis job queue
  (db) => {
    db.exec(`
      CREATE TABLE analysis_jobs (
        ticket_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
        force INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        enqueued_at TEXT NOT NULL,
        finished_at TEXT
      );
    `);
  },
  // v7 — cached AI trend reports (one row per generation; latest wins)
  (db) => {
    db.exec(`
      CREATE TABLE trend_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        generated_at TEXT NOT NULL,
        ticket_count INTEGER NOT NULL,
        trends_json TEXT NOT NULL
      );
    `);
  },
];

function openDatabase(): Database.Database {
  const db = new Database(path.join(process.cwd(), "pylon-triage.db"));
  db.pragma("journal_mode = WAL");
  let version = db.pragma("user_version", { simple: true }) as number;
  for (; version < MIGRATIONS.length; version++) {
    const migrate = MIGRATIONS[version];
    db.transaction(() => {
      migrate(db);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
  return db;
}

// Stashed on globalThis so dev-mode module re-evaluation reuses the same connection.
const globalScope = globalThis as typeof globalThis & { __pylonDb?: Database.Database };
const db = (globalScope.__pylonDb ??= openDatabase());

// ---------------------------------------------------------------------------
// Row shapes (raw DB representation; use the to*() converters for API/UI shapes)
// ---------------------------------------------------------------------------

export interface TicketRow {
  id: string;
  number: number;
  title: string;
  state: string;
  admin_status: AdminStatus;
  requester_name: string | null;
  requester_email: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  raw_json: string;
}

export interface TicketWithSnooze extends TicketRow {
  snoozed_until: string | null;
  snooze_reason: string | null;
}

export interface AnalysisRow {
  ticket_id: string;
  last_activity_at: string | null;
  verdict: AnalysisResult["verdict"];
  what_customer_needs: string;
  why: string;
  needs_reply: number;
  draft_reply: string | null;
  sources: string | null;
  grounded: number;
  edited_draft: string | null;
  edited_at: string | null;
  computed_at: string;
}

export interface AnalysisFailureRow {
  ticket_id: string;
  last_activity_at: string | null;
  error: string;
  failed_at: string;
}

export interface AnalysisJobRow {
  ticket_id: string;
  run_id: string;
  status: "queued" | "running" | "done" | "failed";
  force: number;
  error: string | null;
  enqueued_at: string;
  finished_at: string | null;
}

export interface DispositionRow {
  id: number;
  ticket_id: string;
  ticket_number: number | null;
  ai_verdict: string | null;
  user_action: "agree" | "disagree" | "override";
  acted_at: string;
}

export interface ClosedTicketRow {
  ticket_id: string;
  number: number | null;
  title: string | null;
  requester_email: string | null;
  ai_verdict: string | null;
  grounded: number | null;
  closed_via: "dashboard" | "external";
  created_at: string | null;
  closed_at: string;
}

export interface TicketMessagesRow {
  ticket_id: string;
  last_activity_at: string | null;
  messages_json: string;
  fetched_at: string;
}

/** Safely parses the stored sources JSON back into an array (empty on null/legacy/corrupt rows). */
export function parseSources(json: string | null): AnalysisSource[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as AnalysisSource[]) : [];
  } catch {
    return [];
  }
}

/** Converts a raw analyses row into the API/UI shape (booleans, parsed sources). */
export function toAnalysis(row: AnalysisRow): Analysis {
  return {
    ticket_id: row.ticket_id,
    last_activity_at: row.last_activity_at,
    verdict: row.verdict,
    what_customer_needs: row.what_customer_needs,
    why: row.why,
    needs_reply: Boolean(row.needs_reply),
    draft_reply: row.draft_reply,
    edited_draft: row.edited_draft,
    edited_at: row.edited_at,
    grounded: Boolean(row.grounded),
    sources: parseSources(row.sources),
    computed_at: row.computed_at,
  };
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

const upsertTicketStmt = db.prepare(`
  INSERT INTO tickets (id, number, title, state, admin_status, requester_name, requester_email, created_at, last_activity_at, raw_json)
  VALUES (@id, @number, @title, @state, @admin_status, @requester_name, @requester_email, @created_at, @last_activity_at, @raw_json)
  ON CONFLICT(id) DO UPDATE SET
    number = excluded.number,
    title = excluded.title,
    state = excluded.state,
    admin_status = excluded.admin_status,
    requester_name = excluded.requester_name,
    requester_email = excluded.requester_email,
    created_at = excluded.created_at,
    last_activity_at = excluded.last_activity_at,
    raw_json = excluded.raw_json
`);

export interface UpsertTicketInput {
  id: string;
  number: number;
  title: string;
  state: string;
  admin_status: AdminStatus;
  requester_name: string | null;
  requester_email: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  raw_json: string;
}

export function upsertTicket(ticket: UpsertTicketInput): void {
  upsertTicketStmt.run(ticket);
}

// Tickets in these states are still synced (so we track state transitions accurately) but are
// never shown in the dashboard.
const HIDDEN_STATES = ["waiting_on_customer", "closed", "resolved", "archived", "done"];
const HIDDEN_STATES_PLACEHOLDERS = HIDDEN_STATES.map(() => "?").join(",");

/** Dashboard tickets, with any active snooze joined in. */
export function listTickets(now = new Date().toISOString()): TicketWithSnooze[] {
  return db
    .prepare(
      `SELECT t.*, s.snooze_until AS snoozed_until, s.reason AS snooze_reason
       FROM tickets t
       LEFT JOIN snoozes s ON s.ticket_id = t.id AND s.snooze_until > ?
       WHERE t.state NOT IN (${HIDDEN_STATES_PLACEHOLDERS})
       ORDER BY t.last_activity_at DESC`,
    )
    .all(now, ...HIDDEN_STATES) as TicketWithSnooze[];
}

/** Every locally-stored ticket id, including hidden-state tickets — used to reconcile against Pylon's open set. */
export function listAllTicketIds(): string[] {
  return (db.prepare("SELECT id FROM tickets").all() as { id: string }[]).map((r) => r.id);
}

/** Latest created_at across every synced ticket, used to scan only newly-created tickets on a light sync. */
export function getLatestCreatedAt(): string | null {
  const row = db.prepare("SELECT MAX(created_at) AS max_created_at FROM tickets").get() as {
    max_created_at: string | null;
  };
  return row.max_created_at;
}

/** Drops a ticket and all of its dependent rows from local storage after it's been closed in Pylon. */
export function removeTicket(id: string): void {
  db.prepare("DELETE FROM analyses WHERE ticket_id = ?").run(id);
  db.prepare("DELETE FROM analysis_failures WHERE ticket_id = ?").run(id);
  db.prepare("DELETE FROM snoozes WHERE ticket_id = ?").run(id);
  db.prepare("DELETE FROM ticket_messages WHERE ticket_id = ?").run(id);
  db.prepare("DELETE FROM analysis_jobs WHERE ticket_id = ?").run(id);
  db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
}

export function getTicket(id: string): TicketRow | undefined {
  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | undefined;
}

// ---------------------------------------------------------------------------
// Analyses
// ---------------------------------------------------------------------------

export function getAnalysis(ticketId: string): AnalysisRow | undefined {
  return db.prepare("SELECT * FROM analyses WHERE ticket_id = ?").get(ticketId) as
    | AnalysisRow
    | undefined;
}

export function saveAnalysis(
  ticketId: string,
  lastActivityAt: string | null,
  result: AnalysisResult,
  computedAt: string,
  grounded: boolean,
): void {
  // edited_draft survives a same-activity re-analysis (the user's edit is still relevant) but is
  // cleared when new ticket activity arrives, since the edit was written against the old thread.
  db.prepare(
    `INSERT INTO analyses (ticket_id, last_activity_at, verdict, what_customer_needs, why, needs_reply, draft_reply, sources, grounded, computed_at)
     VALUES (@ticket_id, @last_activity_at, @verdict, @what_customer_needs, @why, @needs_reply, @draft_reply, @sources, @grounded, @computed_at)
     ON CONFLICT(ticket_id) DO UPDATE SET
       verdict = excluded.verdict,
       what_customer_needs = excluded.what_customer_needs,
       why = excluded.why,
       needs_reply = excluded.needs_reply,
       draft_reply = excluded.draft_reply,
       sources = excluded.sources,
       grounded = excluded.grounded,
       computed_at = excluded.computed_at,
       edited_draft = CASE WHEN excluded.last_activity_at IS NOT analyses.last_activity_at THEN NULL ELSE analyses.edited_draft END,
       edited_at = CASE WHEN excluded.last_activity_at IS NOT analyses.last_activity_at THEN NULL ELSE analyses.edited_at END,
       last_activity_at = excluded.last_activity_at`,
  ).run({
    ticket_id: ticketId,
    last_activity_at: lastActivityAt,
    verdict: result.verdict,
    what_customer_needs: result.what_customer_needs,
    why: result.why,
    needs_reply: result.needs_reply ? 1 : 0,
    draft_reply: result.draft_reply,
    sources: JSON.stringify(result.sources ?? []),
    grounded: grounded ? 1 : 0,
    computed_at: computedAt,
  });
  // A fresh success supersedes any prior failure for this ticket.
  db.prepare("DELETE FROM analysis_failures WHERE ticket_id = ?").run(ticketId);
}

export function listAnalyses(): AnalysisRow[] {
  return db.prepare("SELECT * FROM analyses").all() as AnalysisRow[];
}

/** Persists a user edit to the draft reply. Returns false if the ticket has no analysis row. */
export function saveEditedDraft(ticketId: string, editedDraft: string | null, editedAt: string): boolean {
  const result = db
    .prepare("UPDATE analyses SET edited_draft = ?, edited_at = ? WHERE ticket_id = ?")
    .run(editedDraft, editedDraft === null ? null : editedAt, ticketId);
  return result.changes > 0;
}

export function saveAnalysisFailure(
  ticketId: string,
  lastActivityAt: string | null,
  error: string,
  failedAt: string,
): void {
  db.prepare(
    `INSERT INTO analysis_failures (ticket_id, last_activity_at, error, failed_at)
     VALUES (@ticket_id, @last_activity_at, @error, @failed_at)
     ON CONFLICT(ticket_id) DO UPDATE SET
       last_activity_at = excluded.last_activity_at,
       error = excluded.error,
       failed_at = excluded.failed_at`,
  ).run({ ticket_id: ticketId, last_activity_at: lastActivityAt, error, failed_at: failedAt });
}

export function listAnalysisFailures(): AnalysisFailureRow[] {
  return db.prepare("SELECT * FROM analysis_failures").all() as AnalysisFailureRow[];
}

// ---------------------------------------------------------------------------
// Cached message threads
// ---------------------------------------------------------------------------

export function saveTicketMessages(
  ticketId: string,
  lastActivityAt: string | null,
  messagesJson: string,
  fetchedAt: string,
): void {
  db.prepare(
    `INSERT INTO ticket_messages (ticket_id, last_activity_at, messages_json, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ticket_id) DO UPDATE SET
       last_activity_at = excluded.last_activity_at,
       messages_json = excluded.messages_json,
       fetched_at = excluded.fetched_at`,
  ).run(ticketId, lastActivityAt, messagesJson, fetchedAt);
}

export function getTicketMessages(ticketId: string): TicketMessagesRow | undefined {
  return db.prepare("SELECT * FROM ticket_messages WHERE ticket_id = ?").get(ticketId) as
    | TicketMessagesRow
    | undefined;
}

// ---------------------------------------------------------------------------
// Snoozes
// ---------------------------------------------------------------------------

export function setSnooze(ticketId: string, snoozeUntil: string, reason: string | null, createdAt: string): void {
  db.prepare(
    `INSERT INTO snoozes (ticket_id, snooze_until, reason, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ticket_id) DO UPDATE SET
       snooze_until = excluded.snooze_until,
       reason = excluded.reason,
       created_at = excluded.created_at`,
  ).run(ticketId, snoozeUntil, reason, createdAt);
}

export function clearSnooze(ticketId: string): void {
  db.prepare("DELETE FROM snoozes WHERE ticket_id = ?").run(ticketId);
}

/** Ticket ids with a snooze that is still in the future. */
export function activeSnoozedIds(now = new Date().toISOString()): Set<string> {
  const rows = db.prepare("SELECT ticket_id FROM snoozes WHERE snooze_until > ?").all(now) as {
    ticket_id: string;
  }[];
  return new Set(rows.map((r) => r.ticket_id));
}

// ---------------------------------------------------------------------------
// Dispositions (how the user acted on AI verdicts)
// ---------------------------------------------------------------------------

export function recordDisposition(input: {
  ticket_id: string;
  ticket_number: number | null;
  ai_verdict: string | null;
  user_action: DispositionRow["user_action"];
  acted_at: string;
}): void {
  db.prepare(
    `INSERT INTO dispositions (ticket_id, ticket_number, ai_verdict, user_action, acted_at)
     VALUES (@ticket_id, @ticket_number, @ai_verdict, @user_action, @acted_at)`,
  ).run(input);
}

export function listDispositions(): DispositionRow[] {
  return db.prepare("SELECT * FROM dispositions ORDER BY acted_at DESC").all() as DispositionRow[];
}

/** The most recent disposition per ticket — what the UI shows as the recorded feedback. */
export function latestDispositions(): Array<
  Pick<DispositionRow, "ticket_id" | "user_action" | "acted_at">
> {
  return db
    .prepare(
      `SELECT ticket_id, user_action, acted_at FROM dispositions
       WHERE id IN (SELECT MAX(id) FROM dispositions GROUP BY ticket_id)`,
    )
    .all() as Array<Pick<DispositionRow, "ticket_id" | "user_action" | "acted_at">>;
}

// ---------------------------------------------------------------------------
// Closed-ticket history (for analytics; tickets rows are deleted on close)
// ---------------------------------------------------------------------------

export function recordClosedTicket(ticket: TicketRow, closedVia: "dashboard" | "external", closedAt: string): void {
  const analysis = getAnalysis(ticket.id);
  db.prepare(
    `INSERT OR REPLACE INTO closed_tickets (ticket_id, number, title, requester_email, ai_verdict, grounded, closed_via, created_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ticket.id,
    ticket.number,
    ticket.title,
    ticket.requester_email,
    analysis?.verdict ?? null,
    analysis ? analysis.grounded : null,
    closedVia,
    ticket.created_at,
    closedAt,
  );
}

export function listClosedTickets(): ClosedTicketRow[] {
  return db.prepare("SELECT * FROM closed_tickets ORDER BY closed_at DESC").all() as ClosedTicketRow[];
}

// ---------------------------------------------------------------------------
// Trend reports (cached output of the AI trend-spotting pass)
// ---------------------------------------------------------------------------

export interface TrendReportRow {
  id: number;
  generated_at: string;
  ticket_count: number;
  trends_json: string;
}

export function saveTrendReport(generatedAt: string, ticketCount: number, trendsJson: string): void {
  db.prepare("INSERT INTO trend_reports (generated_at, ticket_count, trends_json) VALUES (?, ?, ?)").run(
    generatedAt,
    ticketCount,
    trendsJson,
  );
  // Only the latest report is ever served; keep the table from growing unbounded.
  db.prepare(
    "DELETE FROM trend_reports WHERE id NOT IN (SELECT id FROM trend_reports ORDER BY id DESC LIMIT 5)",
  ).run();
}

export function getLatestTrendReport(): TrendReportRow | undefined {
  return db.prepare("SELECT * FROM trend_reports ORDER BY id DESC LIMIT 1").get() as
    | TrendReportRow
    | undefined;
}

// ---------------------------------------------------------------------------
// Analysis job queue
// ---------------------------------------------------------------------------

/** Re-queues rows stuck in 'running' from a dead/reloaded process, tagging them onto the new run. */
export function adoptOrphanedJobs(runId: string): void {
  db.prepare("UPDATE analysis_jobs SET run_id = ?, status = 'queued' WHERE status = 'running'").run(runId);
}

export function clearFinishedJobs(): void {
  db.prepare("DELETE FROM analysis_jobs WHERE status IN ('done','failed')").run();
}

/** Idempotent enqueue (ticket_id is the PK); returns how many rows were actually added. */
export function enqueueJobs(ticketIds: string[], runId: string, force: boolean, enqueuedAt: string): number {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO analysis_jobs (ticket_id, run_id, status, force, enqueued_at) VALUES (?, ?, 'queued', ?, ?)",
  );
  let added = 0;
  db.transaction(() => {
    for (const id of ticketIds) added += stmt.run(id, runId, force ? 1 : 0, enqueuedAt).changes;
  })();
  return added;
}

/** Atomically claims the oldest queued job for a worker, or returns undefined when the queue is empty. */
export function claimNextJob(): AnalysisJobRow | undefined {
  return db
    .prepare(
      `UPDATE analysis_jobs SET status = 'running'
       WHERE ticket_id = (SELECT ticket_id FROM analysis_jobs WHERE status = 'queued' ORDER BY enqueued_at, ticket_id LIMIT 1)
         AND status = 'queued'
       RETURNING *`,
    )
    .get() as AnalysisJobRow | undefined;
}

export function finishJob(ticketId: string, status: "done" | "failed", error: string | null, finishedAt: string): void {
  db.prepare("UPDATE analysis_jobs SET status = ?, error = ?, finished_at = ? WHERE ticket_id = ?").run(
    status,
    error,
    finishedAt,
    ticketId,
  );
}

export function listJobs(): AnalysisJobRow[] {
  return db.prepare("SELECT * FROM analysis_jobs ORDER BY enqueued_at, ticket_id").all() as AnalysisJobRow[];
}
