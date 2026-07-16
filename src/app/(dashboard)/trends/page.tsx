"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToasts } from "@/components/ToastProvider";
import { friendlyError } from "@/lib/clientErrors";
import type { Trend, TrendImpact, TrendReport } from "@/lib/types";

const PYLON_BASE_URL = process.env.NEXT_PUBLIC_PYLON_APP_URL ?? "https://app.usepylon.com";

const IMPACT_STYLES: Record<TrendImpact, string> = {
  high: "border-rose-200 bg-rose-50 text-rose-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
};

const IMPACT_LABELS: Record<TrendImpact, string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 ${
        light ? "border-white/30 border-t-white" : "border-zinc-200 border-t-indigo-500"
      }`}
    />
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TrendCard({ trend }: { trend: Trend }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">{trend.title}</h2>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${IMPACT_STYLES[trend.impact]}`}
        >
          {IMPACT_LABELS[trend.impact]}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-600">{trend.summary}</p>
      {trend.suggested_action && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          <span className="font-medium">Suggested action:</span> {trend.suggested_action}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-zinc-400">
          {trend.ticket_numbers.length} ticket{trend.ticket_numbers.length === 1 ? "" : "s"}:
        </span>
        {trend.ticket_numbers.map((n) => (
          <a
            key={n}
            href={`${PYLON_BASE_URL}/issues/${n}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50"
          >
            #{n}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function TrendsPage() {
  const { addToast } = useToasts();
  const [report, setReport] = useState<TrendReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/trends", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.report) throw new Error(data.error ?? "Trend analysis failed");
      setReport(data.report);
    } catch (err) {
      const message = friendlyError(err, "Trend analysis failed");
      setError(message);
      addToast(message, "error");
    } finally {
      setGenerating(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/trends");
        const data = await res.json();
        if (data.report) {
          setReport(data.report);
        } else {
          // First visit with nothing cached: kick off a generation right away so the page
          // surfaces trends without an extra click.
          void generate();
        }
      } catch (err) {
        setError(friendlyError(err, "Failed to load trends"));
      } finally {
        setLoading(false);
      }
    })();
  }, [generate]);

  return (
    <div className="min-h-screen bg-white px-8 py-8 text-zinc-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Trends</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Patterns Claude spotted across the open non-admin queue — recurring issues, feature requests, and
              clusters worth a closer look
            </p>
          </div>
          <button
            onClick={() => void generate()}
            disabled={generating || loading}
            title="Re-run trend spotting against the current queue"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {generating && <Spinner light />}
            {generating ? "Analyzing queue…" : "Refresh trends"}
          </button>
        </header>

        {report && (
          <p className="text-xs text-zinc-400">
            Generated {formatTimestamp(report.generated_at)} · from {report.ticket_count} open ticket
            {report.ticket_count === 1 ? "" : "s"}
            {generating && " · refreshing…"}
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading || (generating && !report) ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-400">
            <Spinner />
            {generating ? "Reading the queue and spotting trends — this takes a moment…" : "Loading trends…"}
          </div>
        ) : report && report.trends.length > 0 ? (
          <div className="space-y-4">
            {report.trends.map((trend, i) => (
              <TrendCard key={`${trend.title}-${i}`} trend={trend} />
            ))}
          </div>
        ) : report ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-16 text-center text-sm text-zinc-500">
            {report.ticket_count < 2
              ? "Not enough open tickets to spot trends — sync the queue first."
              : "No meaningful trends in the current queue. That's a good sign — nothing is clustering."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
