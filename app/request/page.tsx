import type { Metadata } from "next";
import RequestForm from "./RequestForm";
import SiteHeader from "../SiteHeader";

export const metadata: Metadata = {
  title: "Contractor request | Contractor Desk",
};

// The steps, summary and language choice are all inside RequestForm so that
// they can be shown in the language the person chooses.
export default function RequestPage() {
  return (
    <>
      <SiteHeader active="builder" />
      <main className="page flex-1">
        <RequestForm />
      </main>
    </>
  );
}
