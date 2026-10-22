import type { Metadata } from "next";
import Link from "next/link";
import RequestForm from "./RequestForm";

export const metadata: Metadata = {
  title: "Contractor request | Contractor Desk",
};

export default function RequestPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
      <Link href="/" className="text-sm text-blue-800 underline">
        &larr; Back to home
      </Link>
      <p className="mt-6 text-sm font-medium text-zinc-600">
        Contractor Desk for Pune Developers
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        Tell us about the disruption
      </h1>
      <p className="mt-3 text-base leading-7 text-zinc-700">
        Describe in your own words what happened and what you need, then fill
        in the details. You check everything before anything is saved.
      </p>

      <div
        role="note"
        className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
      >
        <strong>Before you start.</strong> Real requests are not sent to any AI
        service: you enter the details yourself. (Google&apos;s Gemini AI is
        used only for our own tests with made-up text.) Please do not include
        personal details in the description. Saving a request does not contact
        or match any contractor.
      </div>

      <RequestForm />
    </main>
  );
}
