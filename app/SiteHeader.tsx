import Link from "next/link";
import { raiseRequestHref } from "@/lib/fixtures";
import { Logo } from "./ui";

// The Concept B top bar: brand on the left, the main areas in the middle
// (the active one underlined), and an optional slot on the right.
export type SiteArea = "home" | "builder" | "contractor" | "request" | "operator";

// `short` is shown on phones so all four links fit on one line.
const LINKS: { area: SiteArea; href: string; label: string; short?: string }[] = [
  { area: "home", href: "/", label: "Home" },
  { area: "builder", href: raiseRequestHref(), label: "Raise a request", short: "Request" },
  { area: "contractor", href: "/register", label: "For contractors", short: "Contractors" },
  { area: "operator", href: "/admin", label: "Operator" },
];

export default function SiteHeader({ active, children }: { active?: SiteArea; children?: React.ReactNode }) {
  return (
    <header className="cb-topbar">
      <div className="cb-topnav">
        <Link href="/" className="brand">
          <Logo />
          <span>Contractor Desk</span>
        </Link>
        <nav aria-label="Main" className="cb-nav">
          {LINKS.map((l) => (
            <Link key={l.area} href={l.href} aria-current={active === l.area ? "page" : undefined} className={`cb-nav-link${active === l.area ? " active" : ""}`}>
              {l.short ? (
                <>
                  <span className="nav-long">{l.label}</span>
                  <span className="nav-short">{l.short}</span>
                </>
              ) : (
                l.label
              )}
            </Link>
          ))}
        </nav>
        <div className="cb-nav-end">{children}</div>
      </div>
    </header>
  );
}
