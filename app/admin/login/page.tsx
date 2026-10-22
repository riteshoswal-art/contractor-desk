import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import SiteHeader from "../../SiteHeader";

export const metadata: Metadata = { title: "Admin login | Contractor Desk" };

export default function LoginPage() {
  return (
    <>
      <SiteHeader active="operator" />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Admin login</h1>
        <p className="mt-2 text-sm text-zinc-700">
          For the Contractor Desk founder only.
        </p>
        <LoginForm />
      </main>
    </>
  );
}
