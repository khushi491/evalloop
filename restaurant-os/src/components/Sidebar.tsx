"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/" },
    { label: "Floor Plan", href: "/floor-plan" },
    { label: "Reservations", href: "/reservations" },
    { label: "Waitlist", href: "/waitlist" },
    { label: "Guests", href: "/guests" },
    { label: "Settings", href: "/settings" },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        Restaurant OS
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
