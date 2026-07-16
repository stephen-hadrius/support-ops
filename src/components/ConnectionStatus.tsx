import Image from "next/image";

interface ConnectionStatusProps {
  status: { pylon: boolean; notion: boolean; hadrius: boolean; linear: boolean } | null;
}

function Pill({ label, connected, icon }: { label: string; connected: boolean; icon?: string }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm transition-colors">
        {icon ? (
          <Image src={icon} alt="" width={12} height={12} className="opacity-80" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
        {label} connected
      </span>
    );
  }
  return (
    <a
      href={`/api/mcp/${label.toLowerCase()}/connect`}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 shadow-sm transition-colors"
    >
      {icon ? (
        <Image src={icon} alt="" width={12} height={12} className="opacity-80 grayscale" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}
      Connect {label}
    </a>
  );
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2">
      <Pill label="Pylon" connected={Boolean(status?.pylon)} icon="/pylon-icon.png" />
      <Pill label="Notion" connected={Boolean(status?.notion)} icon="/notion-logo.svg" />
      <Pill label="Hadrius" connected={Boolean(status?.hadrius)} icon="/hadrius-logo.png" />
      <Pill label="Linear" connected={Boolean(status?.linear)} icon="/linear-logo.svg" />
    </div>
  );
}
