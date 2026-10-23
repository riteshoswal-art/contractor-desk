import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { describeBidInvite } from "@/lib/bid-store";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { getDict } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/language";
import BidForm from "./BidForm";
import SiteHeader from "../../SiteHeader";
import { Icon, Stage } from "../../ui";

// A private link: it must not be indexed, cached or shared by search engines.
export const metadata: Metadata = {
  title: "Send your price | Contractor Desk",
  robots: { index: false, follow: false },
};

export default function BidPage(props: PageProps<"/bid/[token]">) {
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
    <div className="page">
      <div className="card cb-screen mx-auto w-full max-w-[480px]">
        <div className="center-done stack" style={{ ["--gap" as string]: "14px", paddingBlock: 24 }}>
          <span className={kind === "used" ? "done-ic" : "done-ic bg-[var(--surface-2)] text-[var(--ink)]"}>
            <Icon name={kind === "used" ? "check" : kind === "closed" ? "lock" : "info"} size={30} />
          </span>
          {LANGUAGES.map((l, i) => {
            const t = getDict(l.code).bid;
            const text = kind === "used" ? t.alreadyDone : kind === "closed" ? t.closed : t.linkBad;
            return (
              <p key={l.code} lang={l.code} role="status" className={i === 0 ? "h2" : "muted mb-0 leading-normal"}>
                {text}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// The left column of the device stage. English only: it describes the page;
// the screen on the right is in the contractor's own language.
const explain = (
  <>
    <span className="eyebrow">Private bid link · one contractor, one job</span>
    <h2 className="h1">One price, one unit, sent once</h2>
    <p className="lead">
      The contractor sees only the job: trade, locality, start date and duration. Never the developer’s details or anyone else’s bid.
    </p>
    <ul className="ticks">
      <li>
        <Icon name="scale" size={16} /> The unit is a required tap, so every price is comparable with others in the same unit.
      </li>
      <li>
        <Icon name="cal" size={16} /> A later starter can still bid, but is told plainly it counts only after their date is confirmed.
      </li>
    </ul>
  </>
);

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
  return (
    <Stage explain={explain}>
      <BidForm token={token} info={result.info} />
    </Stage>
  );
}
