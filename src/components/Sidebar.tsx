"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Ticket queue",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/report",
    label: "Daily report",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4">
        <path d="M4 1.5h6.5L13 4v10.5H4z" strokeLinejoin="round" />
        <path d="M6 6.5h5M6 9h5M6 11.5h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/trends",
    label: "Trends",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4">
        <path d="M2 11.5l4-4 2.5 2.5L14 4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 4.5H14V8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4">
        <path d="M2 13.5h12" strokeLinecap="round" />
        <path d="M4 13.5V8.5" strokeLinecap="round" />
        <path d="M8 13.5V4.5" strokeLinecap="round" />
        <path d="M12 13.5V6.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/qa",
    label: "Knowledge Base",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4">
        <path d="M12.5 1.5H3.5A1.5 1.5 0 002 3v10a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 13V3a1.5 1.5 0 00-1.5-1.5z" strokeLinejoin="round" />
        <path d="M5.5 5h5M5.5 8h5M5.5 11h3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="px-4 pt-5">
        <Image src="/hadrius-logo.png" alt="Hadrius" width={32} height={32} priority />
      </div>
      <div className="mx-3 mt-4 flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2">
        <Image src="/hadrius-logo.png" alt="" width={18} height={18} />
        <span className="text-sm font-medium text-zinc-800">Hadrius</span>
      </div>
      <nav className="mt-5 flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-zinc-100 font-medium text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
            >
              <span className={active ? "text-zinc-700" : "text-zinc-400"}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-zinc-200 px-6 py-4 text-xs text-zinc-400">
        Pylon Ticket Triage
      </div>
    </aside>
  );
}
