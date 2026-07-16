"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  items?: string[];
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  items,
  confirmLabel = "Confirm",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 px-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-300/40"
      >
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-zinc-500">{description}</p>}
        {items && items.length > 0 && (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-sm text-zinc-700">
            {items.map((item) => (
              <li key={item} className="truncate">
                {item}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? "Closing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
