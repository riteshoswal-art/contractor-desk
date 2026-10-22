import type { Metadata } from "next";
import Link from "next/link";
import RegistrationForm from "./RegistrationForm";

export const metadata: Metadata = {
  title: "Contractor registration | Contractor Desk",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
      <Link href="/" className="text-sm text-blue-800 underline">
        &larr; Back to home
      </Link>
      <p className="mt-6 text-sm font-medium text-zinc-600">
        Contractor Desk for Pune Developers
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        Contractor registration
      </h1>
      <p className="mt-3 text-base leading-7 text-zinc-700">
        Tell us your trade and where you work in Pune. This takes about a
        minute.
      </p>

      <div
        role="note"
        className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
      >
        <strong>How your details are used.</strong> Your mobile number is
        stored privately and is not shown publicly. It may be shared with
        relevant developers for work opportunities, as described in the consent
        box below. Being registered does not mean you are verified or
        guaranteed any work. To ask for deletion, contact the person who shared
        this form with you.
      </div>

      <RegistrationForm />
    </main>
  );
}
