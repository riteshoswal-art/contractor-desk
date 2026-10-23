// Presentational pieces shared by the request page, the ticket page and their
// panels (Concept B "Compare & choose"). No data is read here.
import Link from "next/link";
import { formatDate, type RequestRecord } from "@/lib/match";
import { Icon } from "../../../ui";

// "Ramesh Kulkarni" -> "RK"; a missing name gets a neutral mark.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  if (words.length === 0 || name === "Name not given") return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="back-link">
      <Icon name="back" size={16} /> {children}
    </Link>
  );
}

// Needed from · duration · who asked, with the reference's line icons.
export function RequestMeta({ request, who }: { request: RequestRecord; who: string }) {
  return (
    <div className="row wrap small muted" style={{ gap: 16 }}>
      <span className="row" style={{ gap: 6 }}>
        <Icon name="cal" size={16} />
        {request.startDate ? `Needed from ${formatDate(request.startDate)}` : "Start date not stated"}
      </span>
      <span className="row" style={{ gap: 6 }}>
        <Icon name="clock" size={16} />
        {request.durationDays ? `About ${request.durationDays} days` : "Duration not stated"}
      </span>
      <span className="row" style={{ gap: 6 }}>
        <Icon name="file" size={16} />
        <span>
          <span className="sr-only">{who}: </span>
          {request.developerName || "Name not given"}
        </span>
      </span>
    </div>
  );
}

export function Notice({
  tone,
  icon,
  role,
  children,
}: {
  tone: "warn" | "info" | "ok" | "muted";
  icon?: "info" | "scale" | "lock" | "check";
  role?: "status" | "alert" | "note";
  children: React.ReactNode;
}) {
  return (
    <div role={role} className={`notice notice-${tone}`}>
      {icon && (
        <span style={{ marginTop: 2 }}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <div className="grow">{children}</div>
    </div>
  );
}
