import type { Metadata } from "next";
import { Suspense } from "react";
import { requestPrefill } from "@/lib/request";
import RequestForm from "./RequestForm";
import SiteHeader from "../SiteHeader";

export const metadata: Metadata = {
  title: "Contractor request | Contractor Desk",
};

// The steps, summary and language choice are all inside RequestForm so that
// they can be shown in the language the person chooses. The home page search
// sends the trade, locality and start date in the address; they are filled in.
export default function RequestPage(props: PageProps<"/request">) {
  return (
    <>
      <SiteHeader active="builder" />
      <main className="page flex-1">
        <Suspense fallback={<RequestForm />}>
          <PrefilledForm searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function PrefilledForm({ searchParams }: { searchParams: PageProps<"/request">["searchParams"] }) {
  return <RequestForm prefill={requestPrefill(await searchParams)} />;
}
