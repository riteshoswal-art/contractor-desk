import { requireAdmin } from "@/lib/admin-auth";
import { fixturesEnabled } from "@/lib/fixtures";
import { getRecordType } from "@/lib/google-sheets";
import SiteHeader from "../SiteHeader";
import { Icon } from "../ui";
import AdminNav from "./AdminNav";
import { logout } from "./login/actions";

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
          <button type="submit" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 14px", fontSize: "0.88rem" }}>
            Log out
          </button>
        </form>
      </SiteHeader>
      <main className="page flex-1">
        <div className="stack" style={{ ["--gap" as string]: "12px", marginBottom: 28 }}>
          <AdminNav />
          {recordType === "TEST" ? (
            <p role="note" className="notice notice-muted small" style={{ margin: "12px 0 0", alignItems: "center" }}>
              <Icon name="info" size={16} />
              <span>
                {fixturesEnabled()
                  ? "Local records: saved on this computer only, not in the Google Sheet."
                  : "Test records only, not real contractors or developers."}
              </span>
            </p>
          ) : (
            <p role="note" className="notice notice-warn small" style={{ margin: "12px 0 0", alignItems: "center", fontWeight: 600 }}>
              <Icon name="shield" size={16} />
              <span>Real records. These are real people who gave consent. Handle with care.</span>
            </p>
          )}
        </div>

        {children}
      </main>
    </>
  );
}
