import type { Metadata } from "next";
import RegistrationForm from "./RegistrationForm";
import SiteHeader from "../SiteHeader";

export const metadata: Metadata = {
  title: "Contractor registration | Contractor Desk",
};

// The heading, notice and form are all inside RegistrationForm so that they can
// be shown in the language the person chooses.
export default function RegisterPage() {
  return (
    <>
      <SiteHeader active="contractor" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
        <RegistrationForm />
      </main>
    </>
  );
}
