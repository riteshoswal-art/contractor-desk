import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { getRecordType } from "@/lib/google-sheets";
import { logout } from "./login/actions";

// Wraps every admin page: sends visitors who are not logged in to the login
// page, and always shows which kind of data (TEST or REAL) is on screen.
export default async function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const recordType = getRecordType();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between gap-3 text-sm">
        <nav className="flex gap-4">
          <Link href="/admin/requests" className="py-2 font-medium text-blue-800 underline">
            Requests
          </Link>
          <Link href="/admin/dashboard" className="py-2 font-medium text-blue-800 underline">
            Dashboard
          </Link>
        </nav>
        <form action={logout}>
          <button type="submit" className="py-2 text-blue-800 underline">
            Log out
          </button>
        </form>
      </div>

      {recordType === "TEST" ? (
        <div className="mt-4 rounded-md border border-amber-400 bg-amber-100 p-3 text-sm font-medium text-amber-950">
          TEST data only. Everything on this page comes from test records, not
          real contractors or developers.
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-zinc-400 bg-zinc-100 p-3 text-sm font-medium text-zinc-900">
          REAL data. These are real people who gave consent. Handle with care.
        </div>
      )}

      {children}
    </main>
  );
}
