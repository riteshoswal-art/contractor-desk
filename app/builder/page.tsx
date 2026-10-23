import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BUILDER_COOKIE, builderForSession } from "@/lib/builders";
import { demoState } from "@/lib/demo-store";
import { fixturesEnabled } from "@/lib/fixtures";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { loadJobs } from "@/lib/job-store";
import { formatDate } from "@/lib/match";
import { loadContractors, loadRequests } from "@/lib/records";
import { todayInIndia } from "@/lib/registration";
import { validReviews } from "@/lib/review";
import { loadReviews } from "@/lib/review-store";
import LiveRefresh from "../admin/builder/[id]/LiveRefresh";
import SiteHeader from "../SiteHeader";
import { Icon } from "../ui";
import { BuilderTicketForm, ConnectTelegram, FinishAndReview, RegisterBuilderForm, SignOut, Stepper, type TicketInitial } from "./BuilderForms";

export const metadata: Metadata = { title: "Raise a request | Contractor Desk" };

// The builder's page (local data mode only): register, connect Telegram, raise
// a ticket, follow it until a contractor is chosen, then finish and review.
export default function BuilderPage(props: PageProps<"/builder">) {
  return (
    <>
      <SiteHeader active="builder" />
      <main className="page flex-1">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <BuilderHome searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}

type Stage = "not_sent" | "sent" | "quoting" | "bids_sent" | "matched" | "reviewed";
type TicketView = {
  id: string;
  title: string;
  start: string;
  days: number | null;
  asked: number;
  quoted: number;
  declined: number;
  stage: Stage;
  matchedWith: string;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function BuilderHome({ searchParams }: { searchParams: PageProps<"/builder">["searchParams"] }) {
  await connection(); // per-request page: it reads today's date and the live state
  const token = (await cookies()).get(BUILDER_COOKIE)?.value;
  if (!fixturesEnabled()) notFound();
  const sheet = getContractorSheet(); // also loads the saved data
  const builder = builderForSession(token);
  const q = await searchParams;
  const initial: TicketInitial = { trade: one(q.trade), area: one(q.area), startDate: one(q.start) };

  if (!builder)
    return (
      <div className="form-layout">
        <section className="card form-card stack" style={{ ["--gap" as string]: "24px" }}>
          <Stepper now={1} />
          <RegisterBuilderForm />
        </section>
        <HowItWorks />
      </div>
    );

  const s = demoState();
  const recordType = getRecordType();
  const connected = Boolean(s.builderLinks[builder.id]);
  const mine = new Set(Object.entries(s.ticketBuilder).filter(([, b]) => b === builder.id).map(([r]) => r));
  const [requests, contractors, jobs, reviews] = await Promise.all([
    loadRequests(sheet),
    loadContractors(sheet),
    loadJobs(sheet, recordType).catch(() => []),
    loadReviews(sheet, recordType).catch(() => []),
  ]);
  const reviewed = new Set(validReviews(reviews, jobs).map((r) => r.requestId));
  const tickets: TicketView[] = requests
    .filter((r) => mine.has(r.id) && r.recordType === recordType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => {
      const convs = Object.values(s.conversations).filter((c) => c.requestId === r.id);
      // The job record is written whether the choice was made on Telegram or by the operator.
      const job = jobs.find((j) => j.requestId === r.id && j.status !== "cancelled");
      const chosenId = job?.contractorId ?? s.matches[r.id]?.contractorId;
      const quoted = convs.filter((c) => c.bidId).length;
      const declined = convs.filter((c) => c.stage === "declined").length;
      const stage: Stage = reviewed.has(r.id)
        ? "reviewed"
        : chosenId
          ? "matched"
          : s.summaries[r.id]
            ? "bids_sent"
            : quoted + declined > 0
              ? "quoting"
              : convs.length > 0
                ? "sent"
                : "not_sent";
      return {
        id: r.id,
        title: `${r.trade} in ${r.area}`,
        start: r.startDate,
        days: r.durationDays,
        asked: convs.length,
        quoted,
        declined,
        stage,
        matchedWith: chosenId ? (contractors.find((c) => c.id === chosenId)?.name ?? chosenId) : "",
      };
    });

  return (
    <div className="stack" style={{ ["--gap" as string]: "28px" }}>
      <div className="row between wrap">
        <div className="row">
          <span className="avatar">{builder.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <div className="h3">{builder.name}</div>
            <div className="small muted">{builder.company || "Builder"}</div>
          </div>
        </div>
        <SignOut />
      </div>

      {connected ? (
        <p className="notice notice-ok" style={{ margin: 0 }}>
          <Icon name="check" size={16} />
          <span>
            <b>Telegram connected.</b> Quotations for your tickets arrive in your Telegram, and you choose one there with a tap.
          </span>
        </p>
      ) : (
        <section className="card form-card stack" style={{ ["--gap" as string]: "18px", border: "2px solid var(--ink)" }}>
          <Stepper now={2} />
          <div>
            <h1 className="h1">Connect Telegram</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Do this first. The contractors&apos; quotations arrive in your Telegram, and you choose one there with a tap.
            </p>
          </div>
          <ConnectTelegram />
        </section>
      )}

      <BuilderTicketForm today={todayInIndia()} connected={connected} initial={initial} />

      <section className="stack" style={{ ["--gap" as string]: "14px" }}>
        <div className="group-head">
          <h2 className="h1">Your tickets</h2>
          {(tickets.length > 0 || !connected) && <LiveRefresh seconds={5} />}
        </div>
        {tickets.length === 0 && (
          <div className="card tint empty">
            <p className="muted" style={{ margin: 0 }}>
              No tickets yet. Raise one above and follow it here.
            </p>
          </div>
        )}
        {tickets.map((t) => (
          <TicketCard key={t.id} t={t} />
        ))}
      </section>
    </div>
  );
}

const STAGES: { key: Stage; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "quoting", label: "Quotes coming in" },
  { key: "bids_sent", label: "Bids on Telegram" },
  { key: "matched", label: "Matched" },
  { key: "reviewed", label: "Reviewed" },
];
const ORDER: Stage[] = ["not_sent", "sent", "quoting", "bids_sent", "matched", "reviewed"];

function TicketCard({ t }: { t: TicketView }) {
  const reached = ORDER.indexOf(t.stage);
  const pill =
    t.stage === "reviewed" ? (
      <span className="pill pill-ok">Reviewed</span>
    ) : t.stage === "matched" ? (
      <span className="pill pill-dark">Contractor chosen</span>
    ) : t.stage === "not_sent" ? (
      <span className="pill pill-warn">Nobody asked yet</span>
    ) : (
      <span className="pill pill-info">In progress</span>
    );
  return (
    <article className="card stack" style={{ ["--gap" as string]: "16px" }}>
      <div className="row between wrap" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="h2">{t.title}</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            <span className="mono">{t.id}</span>
            {t.start ? ` · from ${formatDate(t.start)}` : ""}
            {t.days ? ` · about ${t.days} days` : ""}
          </div>
        </div>
        {pill}
      </div>
      <ul className="progress" aria-label="Progress">
        {STAGES.map((s) => (
          <li key={s.key} className={ORDER.indexOf(s.key) <= reached ? "on" : ""}>
            <i />
            {s.label}
          </li>
        ))}
      </ul>
      {t.stage === "matched" || t.stage === "reviewed" ? (
        <div className="row between wrap">
          <p style={{ margin: 0 }}>
            <b>Matched with {t.matchedWith}.</b> <span className="muted">You both have each other&apos;s number on Telegram.</span>
          </p>
          {t.stage === "matched" ? <FinishAndReview requestId={t.id} name={t.matchedWith} /> : <span className="small muted">Thank you for your review.</span>}
        </div>
      ) : t.stage === "not_sent" ? (
        <p className="small muted" style={{ margin: 0 }}>
          No available contractor on Telegram matches this ticket yet. Contractors who register for this trade and area can be asked later.
        </p>
      ) : (
        <div className="row between wrap">
          <div className="facts-inline row" style={{ gap: 28, padding: 0, margin: 0 }}>
            {(
              [
                [t.asked, "Asked"],
                [t.quoted, "Quoted"],
                [t.declined, "Declined"],
              ] as const
            ).map(([n, label]) => (
              <div key={label} style={{ display: "grid" }}>
                <span className="stat-n" style={{ fontSize: "1.8rem" }}>
                  {n}
                </span>
                <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0, maxWidth: 420 }}>
            {t.stage === "bids_sent"
              ? "The quotations were sent to your Telegram: choose one there."
              : "The quotations go to your Telegram when everyone has answered, or 10 minutes after asking."}
          </p>
        </div>
      )}
    </article>
  );
}

function HowItWorks() {
  const items = [
    ["Raise a ticket", "Trade, Pune locality, start date and duration."],
    ["Contractors are asked", "Only available contractors for that trade and area, on Telegram."],
    ["One quote each", "Prices are compared only within the same unit."],
    ["You choose", "Then you both get each other's number."],
  ];
  return (
    <aside className="card tint stack summary" style={{ ["--gap" as string]: "14px" }}>
      <span className="eyebrow">How it works</span>
      <ol className="timeline">
        {items.map(([b, s], i) => (
          <li key={b} className={i === 0 ? "now" : ""}>
            <b>{b}</b>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <hr className="divider" />
      <div className="row small" style={{ alignItems: "flex-start" }}>
        <Icon name="lock" size={16} />
        <span>Your number is shared only with the contractor you choose.</span>
      </div>
    </aside>
  );
}
