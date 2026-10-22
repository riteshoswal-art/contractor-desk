import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { fixturesEnabled } from "@/lib/fixtures";
import { getRecordType } from "@/lib/google-sheets";
import SiteHeader from "../SiteHeader";
import { logout } from "./login/actions";

const ADMIN_LINKS: [string, string][] = [
  ["/admin/requests", "Requests"],
  ["/admin/reviews", "Jobs & reviews"],
  ["/admin/builder", "Tickets"],
  ["/admin/telegram", "Telegram"],
  ["/admin/dashboard", "Dashboard"],
];

// Wraps every admin page: sends visitors who are not logged in to the login
// page, and always shows where the data on screen comes from.
export default async function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const recordType = getRecordType();

  return (
    <>
      <SiteHeader active="operator">
        <form action={logout}>
          <button type="submit" className="rounded-full border border-[var(--line-strong)] px-3.5 py-1.5 text-sm font-medium">
            Log out
          </button>
        </form>
      </SiteHeader>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <nav aria-label="Operator" className="flex gap-2 overflow-x-auto pb-1 text-sm">
          {ADMIN_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-full border border-[var(--line)] bg-white px-3.5 py-1.5 font-medium hover:border-[var(--ink)]">
              {label}
            </Link>
          ))}
        </nav>

        {recordType === "TEST" ? (
          <p role="note" className="mt-4 rounded-[12px] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-zinc-700">
            {fixturesEnabled()
              ? "Local records: saved on this computer only, not in the Google Sheet."
              : "Test records only, not real contractors or developers."}
          </p>
        ) : (
          <p role="note" className="mt-4 rounded-[12px] border border-zinc-400 bg-zinc-100 px-3.5 py-2.5 text-sm font-medium text-zinc-900">
            Real records. These are real people who gave consent. Handle with care.
          </p>
        )}

        {children}
      </main>
    </>
  );
}
