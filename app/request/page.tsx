import type { Metadata } from "next";
import RequestForm from "./RequestForm";
import SiteHeader from "../SiteHeader";

export const metadata: Metadata = {
  title: "Contractor request | Contractor Desk",
};

// The heading, notice and form are all inside RequestForm so that they can be
// shown in the language the person chooses.
export default function RequestPage() {
  return (
    <>
      <SiteHeader active="request" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
        <RequestForm />
      </main>
    </>
  );
}
