import Link from "next/link";

// The Concept B top bar: brand on the left, the main areas in the middle.
// `active` underlines the current area.
export type SiteArea = "home" | "builder" | "contractor" | "request" | "operator";

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="currentColor" />
      <path d="M7 19h14M9 19v-6h4v6M15 19V9h4v10" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LINKS: { area: SiteArea; href: string; label: string }[] = [
  { area: "home", href: "/", label: "Home" },
  { area: "builder", href: "/builder", label: "For builders" },
  { area: "contractor", href: "/register", label: "For contractors" },
  { area: "operator", href: "/admin", label: "Operator" },
];

export default function SiteHeader({ active, children }: { active?: SiteArea; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-[var(--ink)]">
          <Logo />
          <span>Contractor Desk</span>
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-5 overflow-x-auto text-sm sm:order-none sm:w-auto sm:flex-1 sm:justify-center">
          {LINKS.map((l) => (
            <Link
              key={l.area}
              href={l.href}
              aria-current={active === l.area ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 py-1.5 font-medium ${active === l.area ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm sm:ml-0">{children}</div>
      </div>
    </header>
  );
}
