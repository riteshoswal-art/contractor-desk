import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import SiteHeader from "../../SiteHeader";
import { Icon } from "../../ui";

export const metadata: Metadata = { title: "Admin login | Contractor Desk" };

export default function LoginPage() {
  return (
    <>
      <SiteHeader active="operator" />
      <main className="page narrow flex-1" style={{ paddingTop: 56 }}>
        <section className="card form-card stack" style={{ ["--gap" as string]: "20px", maxWidth: 440, margin: "0 auto" }}>
          <span className="ic-box">
            <Icon name="lock" />
          </span>
          <div>
            <span className="eyebrow">Operator</span>
            <h1 className="h1" style={{ marginTop: 4 }}>
              Admin login
            </h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              For the Contractor Desk founder only.
            </p>
          </div>
          <LoginForm />
        </section>
      </main>
    </>
  );
}
