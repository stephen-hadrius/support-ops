interface StatCardsProps {
  nonAdminTotal: number;
  canClose: number;
  needsFollowUp: number;
  needsConfirmation: number;
  unclassified: number;
}

function Card({ value, label, tint, accent }: { value: number; label: string; tint: string; accent: string }) {
  return (
    <div className={`flex-1 rounded-xl border px-5 py-4 ${tint}`}>
      <div className={`text-sm font-medium ${accent}`}>{label}</div>
      <div className="mt-1.5 text-3xl font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

export function StatCards({ nonAdminTotal, canClose, needsFollowUp, needsConfirmation, unclassified }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <Card value={nonAdminTotal} label="Non-admin tickets" tint="border-indigo-200 bg-indigo-50" accent="text-indigo-700" />
      <Card value={canClose} label="Can close" tint="border-emerald-200 bg-emerald-50" accent="text-emerald-700" />
      <Card value={needsFollowUp} label="Needs follow-up" tint="border-rose-200 bg-rose-50" accent="text-rose-700" />
      <Card value={needsConfirmation} label="Send confirmation" tint="border-violet-200 bg-violet-50" accent="text-violet-700" />
      <Card
        value={unclassified}
        label="Unclassified"
        tint={unclassified > 0 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-zinc-50"}
        accent={unclassified > 0 ? "text-amber-700" : "text-zinc-500"}
      />
    </div>
  );
}
