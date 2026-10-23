import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { getDict } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/language";
import { describeInvite } from "@/lib/review-store";
import ReviewForm from "./ReviewForm";
import SiteHeader from "../../SiteHeader";
import { Icon, Stage } from "../../ui";

// A private link: it must not be indexed, cached or shared by search engines.
export const metadata: Metadata = {
  title: "Rate the job | Contractor Desk",
  robots: { index: false, follow: false },
};

export default function ReviewPage(props: PageProps<"/review/[token]">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Suspense
          fallback={
            <div className="page">
              <p className="small muted">Loading…</p>
            </div>
          }
        >
          <ReviewContent params={props.params} />
        </Suspense>
      </main>
    </>
  );
}

// A link that does not work says so in all three languages, because we do not
// know which one the visitor reads, and says nothing about who or what it was
// for. The three reasons (unknown, expired, replaced) look the same on purpose.
function LinkProblem({ used }: { used: boolean }) {
  return (
    <div className="page">
      <div className="card cb-screen mx-auto w-full max-w-[480px]">
        <div className="center-done stack" style={{ ["--gap" as string]: "14px", paddingBlock: 24 }}>
          <span className={used ? "done-ic" : "done-ic bg-[var(--surface-2)] text-[var(--ink)]"}>
            <Icon name={used ? "check" : "info"} size={30} />
          </span>
          {LANGUAGES.map((l, i) => {
            const t = getDict(l.code).review;
            return (
              <p key={l.code} lang={l.code} role="status" className={i === 0 ? "h2" : "muted mb-0 leading-normal"}>
                {used ? t.alreadyDone : t.linkBad}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// The left column of the device stage. English only: it describes the page;
// the screen on the right is in the developer's own language.
const explain = (
  <>
    <span className="eyebrow">Private review link · after a completed job</span>
    <h2 className="h1">One honest review per job</h2>
    <p className="lead">
      Only the developer of a completed job gets this link, and it works once. The overall score is the only required field.
    </p>
    <ul className="ticks">
      <li>
        <Icon name="star" size={16} /> Ratings show the number of reviews, and fewer than three is marked “too few to judge”.
      </li>
      <li>
        <Icon name="globe" size={16} /> Feedback is kept exactly as written. An English version appears only when one really exists.
      </li>
    </ul>
  </>
);

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
  return (
    <Stage explain={explain}>
      <ReviewForm token={token} info={result.info} />
    </Stage>
  );
}
