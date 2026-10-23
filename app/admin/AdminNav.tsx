"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS: [string, string][] = [
  ["/admin/requests", "Requests"],
  ["/admin/reviews", "Jobs & reviews"],
  ["/admin/builder", "Tickets"],
  ["/admin/telegram", "Telegram"],
  ["/admin/dashboard", "Dashboard"],
];

// The operator sub-navigation: a row of chips, the current section filled in.
export default function AdminNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Operator" className="row" style={{ gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
      {ADMIN_LINKS.map(([href, label]) => {
        const on = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`chip${on ? " on" : ""}`}
            style={{ whiteSpace: "nowrap", fontWeight: 600, textDecoration: "none", color: on ? undefined : "var(--ink)" }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
