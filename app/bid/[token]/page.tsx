import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { describeBidInvite } from "@/lib/bid-store";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { getDict } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/language";
import BidForm from "./BidForm";
import SiteHeader from "../../SiteHeader";

// A private link: it must not be indexed, cached or shared by search engines.
export const metadata: Metadata = {
  title: "Send your price | Contractor Desk",
  robots: { index: false, follow: false },
};

export default function BidPage(props: PageProps<"/bid/[token]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
        <Suspense fallback={<p className="text-sm">Loading…</p>}>
          <BidContent params={props.params} />
        </Suspense>
      </main>
    </>
  );
}

type Problem = "bad" | "used" | "closed";

// A link that does not work says so in all three languages, because we do not
// know which one the visitor reads, and says nothing about who or what it was
// for. Unknown, expired and replaced links look the same on purpose.
function LinkProblem({ kind }: { kind: Problem }) {
  return (
    <div className="space-y-3">
      {LANGUAGES.map((l) => {
        const t = getDict(l.code).bid;
        const text = kind === "used" ? t.alreadyDone : kind === "closed" ? t.closed : t.linkBad;
        return (
          <p
            key={l.code}
            lang={l.code}
            role="status"
            className={`rounded-md border p-4 text-sm font-medium ${
              kind === "used" ? "border-green-300 bg-green-50 text-green-900" : kind === "closed" ? "border-zinc-300 bg-zinc-50 text-zinc-900" : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            {text}
          </p>
        );
      })}
    </div>
  );
}

async function BidContent({ params }: { params: PageProps<"/bid/[token]">["params"] }) {
  await connection(); // the invitation depends on the current time, so never prerender it
  const { token } = await params;

  let result;
  try {
    result = await describeBidInvite(getContractorSheet(), token, { recordType: getRecordType() });
  } catch {
    console.error("[bid] page_unavailable"); // a label only: never the token
    return <LinkProblem kind="bad" />;
  }
  if (!result.ok) return <LinkProblem kind={result.reason === "used" ? "used" : result.reason === "closed" ? "closed" : "bad"} />;
  return <BidForm token={token} info={result.info} />;
}
