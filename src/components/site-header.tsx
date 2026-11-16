"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/#loop", label: "How it works" },
  { href: "/results", label: "Measured results" },
  { href: "/#try", label: "Try it" },
  { href: "/runs/new", label: "New run" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-50">
          EvalLoop
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Primary">
          {LINKS.map((link) => {
            const active = link.href === "/results" ? pathname === "/results" : pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                  active ? "bg-zinc-900 text-zinc-50" : ""
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
