"use client";

import { useState } from "react";
import type { Ticket } from "@/lib/types";

const PRESETS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
];

/** Modal for snoozing a ticket: pick a duration preset and an optional reason. */
export function SnoozeDialog({
  ticket,
  busy,
  onConfirm,
  onCancel,
}: {
  ticket: Ticket | null;
  busy: boolean;
  onConfirm: (snoozeUntil: string, reason: string | null) => void;
  onCancel: () => void;
}) {
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState("");

  if (!ticket) return null;

  const handleConfirm = () => {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    onConfirm(until, reason.trim() || null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 px-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-300/40"
      >
        <h2 className="text-base font-semibold text-zinc-900">Snooze ticket #{ticket.number}?</h2>
        <p className="mt-1.5 text-sm text-zinc-500">
          Snoozed tickets are hidden from the queue and skipped by auto-analysis until the snooze expires.
          Nothing changes in Pylon.
        </p>
        <div className="mt-4 flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`flex-1 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                days === p.days
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Reason (optional) — e.g. waiting on the next release"
          className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Snoozing…" : "Snooze"}
          </button>
        </div>
      </div>
    </div>
  );
}
