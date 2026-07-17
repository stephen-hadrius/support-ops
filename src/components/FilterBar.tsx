"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminStatus, Verdict, AnalysisSource } from "@/lib/types";
import { VERDICT_LABELS, OPEN_STATE_LABELS } from "@/lib/types";

const ADMIN_OPTIONS: { key: AdminStatus; label: string }[] = [
  { key: "non_admin", label: "Non-admin" },
  { key: "admin", label: "Admin" },
  { key: "unknown", label: "Unknown" },
];

const VERDICT_OPTIONS: { key: Verdict; label: string }[] = [
  { key: "close", label: "Close" },
  { key: "follow_up", label: VERDICT_LABELS.follow_up },
  { key: "confirmation", label: "Confirmation" },
];

const SOURCE_OPTIONS: { key: AnalysisSource["type"]; label: string }[] = [
  { key: "linear", label: "Linear" },
  { key: "knowledge", label: "Notion" },
  { key: "compliance", label: "Hadrius" },
  { key: "pylon_kb", label: "Pylon KB" },
  { key: "thread", label: "Thread Only" }
];

// States surfaced as inline buttons; everything else falls into the "More" dropdown.
const PRIMARY_STATES = ["new", "on_hold", "waiting_on_you"];

function pillClass(active: boolean): string {
  return `rounded-full border px-3 py-1 text-sm font-medium transition ${
    active
      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
  }`;
}

function toggle<T>(list: T[], key: T): T[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** Multi-select pill group. An empty selection means "All" (no filter); the All pill clears it. */
function MultiTabGroup<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { key: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange([])} className={pillClass(selected.length === 0)}>
        All
      </button>
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(toggle(selected, o.key))} className={pillClass(selected.includes(o.key))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function stateLabel(state: string): string {
  return OPEN_STATE_LABELS[state] ?? state.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StateFilter({
  selected,
  onChange,
  availableStates,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  availableStates: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const primary = PRIMARY_STATES.filter((s) => availableStates.includes(s));
  const more = availableStates.filter((s) => !PRIMARY_STATES.includes(s));
  const selectedMore = more.filter((s) => selected.includes(s)).length;

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange([])} className={pillClass(selected.length === 0)}>
        All
      </button>
      {primary.map((s) => (
        <button key={s} onClick={() => onChange(toggle(selected, s))} className={pillClass(selected.includes(s))}>
          {stateLabel(s)}
        </button>
      ))}
      {more.length > 0 && (
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className={`inline-flex items-center gap-1 ${pillClass(selectedMore > 0)}`}
          >
            {selectedMore > 0 ? `More (${selectedMore})` : "More"}
            <span className={`text-[0.65rem] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
          </button>
          {open && (
            <div className="absolute left-0 z-20 mt-2 min-w-[13rem] rounded-lg border border-zinc-200 bg-white p-1 shadow-lg shadow-zinc-200/60">
              {more.map((s) => {
                const on = selected.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => onChange(toggle(selected, s))}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm transition ${
                      on ? "bg-indigo-50 text-indigo-700" : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <span>{stateLabel(s)}</span>
                    {on && <span className="text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FilterBarProps {
  adminFilter: AdminStatus[];
  onAdminFilterChange: (v: AdminStatus[]) => void;
  verdictFilter: Verdict[];
  onVerdictFilterChange: (v: Verdict[]) => void;
  sourceFilter: AnalysisSource["type"][];
  onSourceFilterChange: (v: AnalysisSource["type"][]) => void;
  stateFilter: string[];
  onStateFilterChange: (v: string[]) => void;
  availableStates: string[];
  search: string;
  onSearchChange: (v: string) => void;
}

export function FilterBar({
  adminFilter,
  onAdminFilterChange,
  verdictFilter,
  onVerdictFilterChange,
  sourceFilter,
  onSourceFilterChange,
  stateFilter,
  onStateFilterChange,
  availableStates,
  search,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" strokeLinecap="round" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title, ticket #, requester name/email…"
          className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-4 pl-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-x-2">
          <span className="text-xs font-medium text-zinc-500">Admin status</span>
          <MultiTabGroup options={ADMIN_OPTIONS} selected={adminFilter} onChange={onAdminFilterChange} />
        </div>
        <div className="flex items-center gap-x-2">
          <span className="text-xs font-medium text-zinc-500">Verdict</span>
          <MultiTabGroup options={VERDICT_OPTIONS} selected={verdictFilter} onChange={onVerdictFilterChange} />
        </div>
        <div className="flex items-center gap-x-2">
          <span className="text-xs font-medium text-zinc-500">Source</span>
          <MultiTabGroup options={SOURCE_OPTIONS} selected={sourceFilter} onChange={onSourceFilterChange} />
        </div>
        {availableStates.length > 0 && (
          <div className="flex items-center gap-x-2">
            <span className="text-xs font-medium text-zinc-500">State</span>
            <StateFilter selected={stateFilter} onChange={onStateFilterChange} availableStates={availableStates} />
          </div>
        )}
      </div>
    </div>
  );
}
