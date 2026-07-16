export type AdminStatus = "admin" | "non_admin" | "unknown";
export type Verdict = "close" | "follow_up" | "confirmation";
export type DispositionAction = "agree" | "disagree" | "override";

export const OPEN_STATE_LABELS: Record<string, string> = {
  new: "New",
  waiting_on_you: "Waiting on you",
  waiting_on_customer: "Waiting on customer",
  on_hold: "On hold",
};

export interface Ticket {
  id: string;
  number: number;
  title: string;
  state: string;
  admin_status: AdminStatus;
  requester_name: string | null;
  requester_email: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  /** ISO timestamp while an active snooze hides the ticket; null otherwise. */
  snoozed_until: string | null;
  snooze_reason: string | null;
}

export interface AnalysisSource {
  /** "thread" = the ticket's own messages; "knowledge" = internal Notion documentation; "compliance" = Hadrius compliance documentation; "linear" = related Linear tickets. */
  type: "thread" | "knowledge" | "compliance" | "linear";
  /** Short human label: a doc/page title, or which thread message (who + when). */
  reference: string;
  /** Source URL when the knowledge text provided one; null for thread messages. */
  url: string | null;
}

export interface Analysis {
  ticket_id: string;
  last_activity_at: string | null;
  verdict: Verdict;
  what_customer_needs: string;
  why: string;
  needs_reply: boolean;
  draft_reply: string | null;
  /** User-edited version of the draft reply; survives same-activity re-analysis. */
  edited_draft: string | null;
  edited_at: string | null;
  /** False when no internal Notion knowledge grounded this analysis (search failed or found nothing). */
  grounded: boolean;
  sources: AnalysisSource[];
  computed_at: string;
}

export interface AnalysisFailure {
  ticket_id: string;
  last_activity_at: string | null;
  error: string;
  failed_at: string;
}

export type AnalysisJobStatus = "queued" | "running" | "done" | "failed";

export interface AnalysisRunStatus {
  run_id: string | null;
  active: boolean;
  total: number;
  counts: Record<AnalysisJobStatus, number>;
  jobs: Array<{ ticket_id: string; status: AnalysisJobStatus }>;
  failures: Array<{ ticket_id: string; error: string | null }>;
}

export interface TicketMessage {
  id: string;
  body_html?: string;
  is_private?: boolean;
  from_customer?: boolean;
  sent_at?: string;
  [key: string]: unknown;
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  close: "Close",
  follow_up: "Follow-up",
  confirmation: "Confirmation",
};

export type ReportAction = "close" | "follow_up" | "confirmation" | "analyze";

export interface ReportTicket {
  number: number;
  title: string;
  state: string;
  url: string | null;
  requester_name: string | null;
  action: ReportAction;
  /** Follow-up owed and no support reply (or activity) for STALE_DAYS or more. */
  stale: boolean;
  /** Days since the ticket's last activity of any kind. */
  idle_days: number | null;
  /** Days since the last customer-facing support reply, when the thread is cached. */
  days_since_support_reply: number | null;
  /** A ready-to-paste draft reply exists. */
  has_draft: boolean;
}

export interface AssigneeReport {
  assignee: string;
  tickets: ReportTicket[];
  counts: Record<ReportAction, number>;
  stale_count: number;
}

export interface DailyReport {
  generated_at: string;
  total: number;
  counts: Record<ReportAction, number>;
  stale_count: number;
  snoozed_count: number;
  assignees: AssigneeReport[];
}

export type TrendImpact = "low" | "medium" | "high";

export interface Trend {
  title: string;
  summary: string;
  impact: TrendImpact;
  /** Pylon ticket numbers this trend was observed in. */
  ticket_numbers: number[];
  suggested_action: string | null;
}

export interface TrendReport {
  generated_at: string;
  /** How many tickets were in the corpus the trends were spotted from. */
  ticket_count: number;
  trends: Trend[];
}
