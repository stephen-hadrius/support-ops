import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { listClosedTickets, listDispositions } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { VERDICT_LABELS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Triage Analytics",
  description: "Closure history and AI-verdict accuracy for the Pylon triage dashboard.",
};

const VERDICT_BAR_COLORS: Record<string, string> = {
  close: "bg-emerald-500",
  follow_up: "bg-rose-500",
  confirmation: "bg-violet-500",
  unanalyzed: "bg-zinc-300",
};

const DISPOSITION_BAR_COLORS: Record<string, string> = {
  agree: "bg-emerald-500",
  disagree: "bg-rose-500",
  override: "bg-amber-500",
};

function Card({ value, label, tint, accent }: { value: string; label: string; tint: string; accent: string }) {
  return (
    <div className={`flex-1 rounded-xl border px-5 py-4 ${tint}`}>
      <div className={`text-sm font-medium ${accent}`}>{label}</div>
      <div className="mt-1.5 text-3xl font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-44 shrink-0 text-zinc-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-zinc-500">
        {count} · {pct}%
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

/** Monday of the week the ISO timestamp falls in, as YYYY-MM-DD (UTC). */
function weekStart(iso: string): string {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

export default async function AnalyticsPage() {
  // better-sqlite3 reads are synchronous; without this the page would prerender a stale DB
  // snapshot at build time instead of rendering per request.
  await connection();
  const closed = listClosedTickets();
  const dispositions = listDispositions();

  const total = closed.length;
  const viaDashboard = closed.filter((c) => c.closed_via === "dashboard").length;
  const viaExternal = total - viaDashboard;

  const verdictCounts = new Map<string, number>();
  for (const c of closed) {
    const key = c.ai_verdict ?? "unanalyzed";
    verdictCounts.set(key, (verdictCounts.get(key) ?? 0) + 1);
  }

  const groundedKnown = closed.filter((c) => c.grounded !== null);
  const groundedRate =
    groundedKnown.length > 0
      ? Math.round((100 * groundedKnown.filter((c) => c.grounded === 1).length) / groundedKnown.length)
      : null;

  const dispositionCounts = new Map<string, number>();
  for (const d of dispositions) {
    dispositionCounts.set(d.user_action, (dispositionCounts.get(d.user_action) ?? 0) + 1);
  }
  const agreementRate =
    dispositions.length > 0
      ? Math.round((100 * (dispositionCounts.get("agree") ?? 0)) / dispositions.length)
      : null;

  const weekCounts = new Map<string, number>();
  for (const c of closed) {
    const week = weekStart(c.closed_at);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
  }
  const weeks = [...weekCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8);
  const maxWeek = Math.max(1, ...weeks.map(([, n]) => n));

  const recent = closed.slice(0, 50);

  const verdictLabel = (key: string) =>
    key === "unanalyzed" ? "No analysis" : (VERDICT_LABELS[key as keyof typeof VERDICT_LABELS] ?? key);

  return (
    <div className="min-h-screen bg-white px-8 py-8 text-zinc-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Analytics</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Closure history and how the AI verdicts held up · recorded from dashboard closes and full refreshes
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            ← Back to queue
          </Link>
        </header>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card value={String(total)} label="Tickets closed" tint="border-indigo-200 bg-indigo-50" accent="text-indigo-700" />
          <Card value={String(viaDashboard)} label="Closed via dashboard" tint="border-emerald-200 bg-emerald-50" accent="text-emerald-700" />
          <Card value={String(viaExternal)} label="Closed externally" tint="border-zinc-200 bg-zinc-50" accent="text-zinc-500" />
          <Card
            value={agreementRate === null ? "—" : `${agreementRate}%`}
            label="Verdict agreement"
            tint="border-violet-200 bg-violet-50"
            accent="text-violet-700"
          />
          <Card
            value={groundedRate === null ? "—" : `${groundedRate}%`}
            label="Grounded in docs"
            tint="border-sky-200 bg-sky-50"
            accent="text-sky-700"
          />
        </div>

        {total === 0 && dispositions.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
            Nothing recorded yet. Closures land here when you close tickets from the dashboard (or a full
            refresh notices tickets closed elsewhere), and verdict feedback comes from the Agree / Disagree /
            Override buttons on analyzed tickets.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Section title="AI verdict at close time">
                {[...verdictCounts.entries()]
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, count]) => (
                    <BarRow
                      key={key}
                      label={verdictLabel(key)}
                      count={count}
                      total={total}
                      color={VERDICT_BAR_COLORS[key] ?? "bg-indigo-500"}
                    />
                  ))}
                {total === 0 && <p className="text-sm text-zinc-400">No closures recorded yet.</p>}
              </Section>

              <Section title="Verdict feedback (all recorded dispositions)">
                {(["agree", "disagree", "override"] as const).map((action) => (
                  <BarRow
                    key={action}
                    label={action.charAt(0).toUpperCase() + action.slice(1)}
                    count={dispositionCounts.get(action) ?? 0}
                    total={dispositions.length}
                    color={DISPOSITION_BAR_COLORS[action]}
                  />
                ))}
                {dispositions.length === 0 && (
                  <p className="text-sm text-zinc-400">
                    No feedback recorded yet — use Agree / Disagree / Override on an analyzed ticket.
                  </p>
                )}
              </Section>
            </div>

            {weeks.length > 0 && (
              <Section title="Closures per week (last 8 weeks with activity)">
                {weeks.map(([week, count]) => (
                  <BarRow
                    key={week}
                    label={`Week of ${formatDate(week)}`}
                    count={count}
                    total={maxWeek}
                    color="bg-indigo-500"
                  />
                ))}
              </Section>
            )}

            {recent.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500">
                      {["Ticket", "Title", "AI verdict", "Grounded", "Closed via", "Closed"].map((header) => (
                        <th key={header} className="px-4 py-3">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((c) => (
                      <tr key={`${c.ticket_id}-${c.closed_at}`} className="border-b border-zinc-100 text-sm">
                        <td className="px-4 py-3 font-medium text-indigo-600">#{c.number ?? "—"}</td>
                        <td className="max-w-md truncate px-4 py-3 text-zinc-700">{c.title ?? "—"}</td>
                        <td className="px-4 py-3 text-zinc-600">{verdictLabel(c.ai_verdict ?? "unanalyzed")}</td>
                        <td className="px-4 py-3 text-zinc-600">
                          {c.grounded === null ? "—" : c.grounded === 1 ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600">
                          {c.closed_via === "dashboard" ? "Dashboard" : "External"}
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{formatDate(c.closed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
