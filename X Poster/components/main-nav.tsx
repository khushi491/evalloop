 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Landing" },
  { href: "/feed", label: "News Feed" },
  { href: "/sources", label: "Sources" },
  { href: "/generate", label: "Generate Post" },
  { href: "/scheduled", label: "Scheduled" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" }
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <aside className="dashboard-sidebar">
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            AI NEWS
          </p>
          <p className="text-sm font-medium text-slate-100">
            AutoPoster
          </p>
        </div>
        <span className="badge-accent badge text-[10px]">
          beta
        </span>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-pill ${active ? "nav-pill-active" : ""}`}
            >
              {active && <span className="pill-dot" />}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
        <p className="font-medium text-slate-200">
          Pipeline status
        </p>
        <p className="flex items-center justify-between">
          <span>News ingestion</span>
          <span className="badge-muted badge">
            idle
          </span>
        </p>
        <p className="flex items-center justify-between">
          <span>Summarization</span>
          <span className="badge-muted badge">
            manual
          </span>
        </p>
        <p className="flex items-center justify-between">
          <span>Auto publish</span>
          <span className="badge-muted badge">
            off
          </span>
        </p>
      </div>
    </aside>
  );
}

