"use client";

import { useState } from "react";
import type { Analysis, AnalysisSource } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { friendlyError } from "@/lib/clientErrors";
import { useToasts } from "./ToastProvider";
import Image from "next/image";

export function DraftReplyPanel({
  ticketId,
  draftReply,
  editedDraft,
  editedAt,
  sources = [],
  onSaved,
}: {
  ticketId: string;
  draftReply: string | null;
  editedDraft: string | null;
  editedAt: string | null;
  sources?: AnalysisSource[];
  onSaved: (analysis: Analysis) => void;
}) {
  // The saved edit wins over the AI draft; edits are cleared server-side when new ticket activity arrives.
  const baseline = editedDraft ?? draftReply ?? "";
  const [text, setText] = useState(baseline);
  const [lastBaseline, setLastBaseline] = useState(baseline);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToasts();

  // Reset the editable text when the server-side draft or saved edit changes (fresh analysis, a
  // save/revert, or an edit cleared by new activity), without clobbering in-progress edits on
  // every render.
  if (baseline !== lastBaseline) {
    setLastBaseline(baseline);
    setText(baseline);
  }

  if (draftReply === null && editedDraft === null) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-400">
        No reply needed right now.
      </div>
    );
  }

  const dirty = text !== baseline;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const patchDraft = async (edited: string | null) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_draft: edited }),
      });
      const data = await res.json();
      if (!res.ok || !data.analysis) throw new Error(data.error ?? "Failed to save the draft edit");
      onSaved(data.analysis);
    } catch (err) {
      addToast(friendlyError(err, "Failed to save the draft edit"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase">
            Draft — not sent
          </span>
          {editedAt && (
            <span
              title="Your edit is saved locally and survives re-analysis until new ticket activity arrives"
              className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-sky-700 uppercase"
            >
              Edited {formatDate(editedAt)}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full resize-y rounded-md border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none"
      />
      
      {/* Action Buttons - Always visible */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(`/api/tickets/${ticketId}/send-reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: text }),
              });
              if (!res.ok) throw new Error((await res.json()).error);
              addToast("Reply sent to customer successfully!", "success");
            } catch (err) {
              addToast(friendlyError(err, "Failed to send reply"), "error");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || !text.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition shadow-sm"
        >
          Send Public Reply
        </button>
        <button
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch(`/api/tickets/${ticketId}/send-note`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: text }),
              });
              if (!res.ok) throw new Error((await res.json()).error);
              addToast("Internal note added successfully!", "success");
            } catch (err) {
              addToast(friendlyError(err, "Failed to add internal note"), "error");
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || !text.trim()}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition shadow-sm"
        >
          Add Internal Note
        </button>
      </div>

      {/* Draft Management Buttons - Only visible when dirty or edited */}
      {(dirty || editedDraft !== null) && (
        <div className="mt-3 flex items-center gap-2 border-t border-amber-200/50 pt-3">
          {dirty && (
            <>
              <button
                onClick={() => void patchDraft(text)}
                disabled={saving}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save draft locally"}
              </button>
              <button
                onClick={() => setText(baseline)}
                disabled={saving}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
              >
                Discard changes
              </button>
            </>
          )}
          {!dirty && editedDraft !== null && (
            <button
              onClick={() => void patchDraft(null)}
              disabled={saving}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
            >
              {saving ? "Reverting…" : "Revert to AI draft"}
            </button>
          )}
        </div>
      )}
      {sources.length > 0 && (
        <div className="mt-3 border-t border-amber-200/70 pt-3">
          <div className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Sources</div>
          <ul className="mt-1.5 space-y-1">
            {sources.map((s, i) => {
              let displayType = s.type as string;
              let label = "Thread";
              let colorClass = "bg-zinc-100 text-zinc-500";
              let logoSrc = null;
              
              if (s.url?.includes("linear.app")) {
                displayType = "linear";
              } else if (s.url?.includes("notion.so") || s.url?.includes("notion.site")) {
                displayType = "knowledge";
              } else if (s.url?.includes("hadrius.com")) {
                displayType = "compliance";
              }

              if (displayType === "knowledge") {
                label = "Notion";
                colorClass = "bg-sky-100 text-sky-700";
                logoSrc = "/notion-logo.png";
              } else if (displayType === "compliance") {
                label = "Hadrius";
                colorClass = "bg-purple-100 text-purple-700";
                logoSrc = "/hadrius-logo.png";
              } else if (displayType === "linear") {
                label = "Linear";
                colorClass = "bg-orange-100 text-orange-700";
                logoSrc = "/linear-logo.png";
              } else if (displayType === "thread") {
                label = "Pylon Thread";
                logoSrc = "/pylon-icon.png";
              }

              return (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className={`shrink-0 flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-medium ${colorClass}`}>
                  {logoSrc && <img src={logoSrc} alt={label} className="h-3.5 w-3.5 object-contain" />}
                  {label}
                </span>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline flex-1 truncate"
                  >
                    {s.reference}
                  </a>
                ) : (
                  <span className="text-zinc-600 flex-1 truncate">{s.reference}</span>
                )}
              </li>
            )})}
          </ul>
        </div>
      )}
    </div>
  );
}
