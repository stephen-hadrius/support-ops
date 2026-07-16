"use client";

import { useState, useEffect } from "react";
import { friendlyError } from "@/lib/clientErrors";
import { useToasts } from "@/components/ToastProvider";

interface QAPair {
  Question: string;
  Answer: string;
}

export default function QAPage() {
  const [qaPairs, setQaPairs] = useState<QAPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToasts();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function loadQA() {
      try {
        const res = await fetch("/api/qa");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load Q&A pairs");
        setQaPairs(json.data || []);
      } catch (err) {
        const msg = friendlyError(err, "Failed to load Q&A pairs");
        setError(msg);
        addToast(msg, "error");
      } finally {
        setLoading(false);
      }
    }
    loadQA();
  }, [addToast]);

  const handleDelete = async (question: string) => {
    if (!confirm("Are you sure you want to delete this Q&A pair? It will be removed from Google Drive permanently.")) return;
    
    setDeleting(question);
    
    // Optimistic update
    const previous = [...qaPairs];
    setQaPairs(qaPairs.filter(p => p.Question !== question));
    
    try {
      const res = await fetch("/api/qa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }
      addToast("Q&A pair deleted successfully", "success");
    } catch (err) {
      // Revert optimistic update
      setQaPairs(previous);
      addToast(friendlyError(err, "Failed to delete Q&A pair"), "error");
    } finally {
      setDeleting(null);
    }
  };

  const getCategory = (q: string, a: string) => {
    const text = ((q || "") + " " + (a || "")).toLowerCase();
    if (text.includes("questionnaire") || text.includes("certification") || text.includes("attestment")) return "Certifications & Attestations";
    if (text.includes("schwab") || text.includes("plaid") || text.includes("brokerage") || text.includes("connector")) return "Brokerage & Integrations";
    if (text.includes("appreciation") || text.includes("congratulations") || text.includes("funding") || text.includes("gift") || text.includes("entertainment")) return "Gifts & Entertainment";
    if (text.includes("appointment") || text.includes("scheduling") || text.includes("meeting") || text.includes("calendar")) return "Meetings & Scheduling";
    if (text.includes("disconnect") || text.includes("reconnect") || text.includes("telegram") || text.includes("slack")) return "Communications & Feeds";
    if (text.includes("sftp") || text.includes("transfer")) return "File Transfers (SFTP)";
    if (text.includes("password") || text.includes("login") || text.includes("mfa")) return "Access & Security";
    return "General Support";
  };

  const filtered = qaPairs.filter(
    (pair) =>
      pair.Question?.toLowerCase().includes(search.toLowerCase()) ||
      pair.Answer?.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, pair) => {
    const cat = getCategory(pair.Question, pair.Answer);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(pair);
    return acc;
  }, {} as Record<string, QAPair[]>);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50/50">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Knowledge Base</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Automatically curated Q&A pairs from resolved support tickets (updated nightly)
          </p>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search Q&A..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-zinc-400 text-sm">
            Loading Q&A pairs...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
            <p className="font-medium">Failed to load Q&A data</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-zinc-400 text-sm">
            {qaPairs.length === 0 ? "No Q&A pairs found." : "No matches found."}
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-8 pb-12">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, pairs]) => (
              <div key={category} className="space-y-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                  <span className="h-px flex-1 bg-zinc-200"></span>
                  {category}
                  <span className="h-px flex-1 bg-zinc-200"></span>
                </h2>
                
                {pairs.map((pair, i) => (
                  <div key={i} className="group relative rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300">
                    <button
                      onClick={() => handleDelete(pair.Question)}
                      disabled={deleting === pair.Question}
                      className="absolute right-4 top-4 rounded p-1.5 text-zinc-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                      title="Delete Q&A Pair"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                        <path d="M3 4h10M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M12 4l-.5 9a1.5 1.5 0 01-1.5 1.5h-4A1.5 1.5 0 014.5 13L4 4" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <h3 className="pr-8 font-medium text-zinc-900 text-base">{pair.Question}</h3>
                    <div className="mt-3 text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
                      {pair.Answer}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
