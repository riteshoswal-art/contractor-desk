import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { getDict } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/language";
import { describeInvite } from "@/lib/review-store";
import ReviewForm from "./ReviewForm";

// A private link: it must not be indexed, cached or shared by search engines.
export const metadata: Metadata = {
  title: "Rate the job | Contractor Desk",
  robots: { index: false, follow: false },
};

export default function ReviewPage(props: PageProps<"/review/[token]">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <ReviewContent params={props.params} />
      </Suspense>
    </main>
  );
}

// A link that does not work says so in all three languages, because we do not
// know which one the visitor reads, and says nothing about who or what it was
// for. The three reasons (unknown, expired, replaced) look the same on purpose.
function LinkProblem({ used }: { used: boolean }) {
  return (
    <div className="space-y-3">
      {LANGUAGES.map((l) => {
        const t = getDict(l.code).review;
        return (
          <p
            key={l.code}
            lang={l.code}
            role="status"
            className={`rounded-md border p-4 text-sm font-medium ${
              used ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            {used ? t.alreadyDone : t.linkBad}
          </p>
        );
      })}
    </div>
  );
}

async function ReviewContent({ params }: { params: PageProps<"/review/[token]">["params"] }) {
  await connection(); // the invitation depends on the current time, so never prerender it
  const { token } = await params;

  let result;
  try {
    result = await describeInvite(getContractorSheet(), token, { recordType: getRecordType() });
  } catch {
    console.error("[review] page_unavailable"); // a label only: never the token
    return <LinkProblem used={false} />;
  }
  if (!result.ok) return <LinkProblem used={result.reason === "used"} />;
  return <ReviewForm token={token} info={result.info} />;
}
