import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BUILDER_COOKIE, builderForSession } from "@/lib/builders";
import { demoState } from "@/lib/demo-store";
import { fixturesEnabled } from "@/lib/fixtures";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { formatDate } from "@/lib/match";
import { loadContractors, loadRequests } from "@/lib/records";
import { todayInIndia } from "@/lib/registration";
import LiveRefresh from "../admin/builder/[id]/LiveRefresh";
import SiteHeader from "../SiteHeader";
import { BuilderTicketForm, ConnectTelegram, RegisterBuilderForm, SignOut } from "./BuilderForms";

export const metadata: Metadata = { title: "For builders | Contractor Desk" };

// The builder's page (local data mode only): register, connect Telegram, raise
// a ticket, and follow it until a contractor is chosen.
export default function BuilderPage() {
  return (
    <>
      <SiteHeader active="builder" />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-10 sm:py-14">
        <Suspense fallback={<p className="text-sm">Loading…</p>}>
          <BuilderHome />
        </Suspense>
      </main>
    </>
  );
}

type TicketView = {
  id: string;
  title: string;
  start: string;
  days: number | null;
  asked: number;
  quoted: number;
  declined: number;
  summarySent: boolean;
  matchedWith: string;
};

async function BuilderHome() {
  await connection(); // per-request page: it reads today's date and the live state
  const token = (await cookies()).get(BUILDER_COOKIE)?.value;
  if (!fixturesEnabled()) notFound();
  const sheet = getContractorSheet(); // also loads the saved data
  const builder = builderForSession(token);

  if (!builder)
    return (
      <Split>
        <RegisterBuilderForm />
      </Split>
    );

  const s = demoState();
  const connected = Boolean(s.builderLinks[builder.id]);
  const mine = new Set(Object.entries(s.ticketBuilder).filter(([, b]) => b === builder.id).map(([r]) => r));
  const [requests, contractors] = await Promise.all([loadRequests(sheet), loadContractors(sheet)]);
  const tickets: TicketView[] = requests
    .filter((r) => mine.has(r.id) && r.recordType === getRecordType())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => {
      const convs = Object.values(s.conversations).filter((c) => c.requestId === r.id);
      const match = s.matches[r.id];
      return {
        id: r.id,
        title: `${r.trade} in ${r.area}`,
        start: r.startDate,
        days: r.durationDays,
        asked: convs.length,
        quoted: convs.filter((c) => c.bidId).length,
        declined: convs.filter((c) => c.stage === "declined").length,
        summarySent: Boolean(s.summaries[r.id]),
        matchedWith: match ? (contractors.find((c) => c.id === match.contractorId)?.name ?? match.contractorId) : "",
      };
    });

  return (
    <Split>
      <div className="space-y-5">
        <section className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-2)] font-semibold">{builder.name.slice(0, 1).toUpperCase()}</span>
            <span>
              Signed in as <b>{builder.name}</b>
              {builder.company ? ` (${builder.company})` : ""}
            </span>
          </span>
          <SignOut />
        </section>

        <section className={`space-y-3 rounded-[20px] p-5 ${connected ? "bg-[var(--surface-2)]" : "border-2 border-[var(--ink)]"}`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Connect Telegram</h2>
            {connected ? (
              <span className="rounded-full bg-[var(--ok-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ok-ink)]">Connected</span>
            ) : (
              <span className="cb-eyebrow !text-[var(--accent)]">Step 1</span>
            )}
          </div>
          <p className="text-sm leading-6 text-[var(--muted)]">
            {connected
              ? "Quotations for your tickets arrive in your Telegram, and you choose one there with a tap."
              : "Do this first. The contractors' quotations arrive in your Telegram, and you choose one there with a tap."}
          </p>
          {!connected && <ConnectTelegram />}
        </section>

        <BuilderTicketForm today={todayInIndia()} connected={connected} />

        <section className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Your tickets</h2>
            {(tickets.length > 0 || !connected) && <LiveRefresh seconds={5} />}
          </div>
          {tickets.length === 0 && <p className="text-sm text-[var(--muted)]">No tickets yet.</p>}
          {tickets.map((t) => (
            <TicketCard key={t.id} t={t} />
          ))}
        </section>
      </div>
    </Split>
  );
}

function Split({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
      <div className="space-y-4 lg:sticky lg:top-24">
        <p className="cb-kicker">For builders</p>
        <h1 className="cb-display !text-[clamp(2rem,4vw,3rem)]">Find a contractor for the work you need.</h1>
        <p className="text-lg leading-relaxed text-[var(--muted)]">
          Raise a ticket. Available contractors in that area get it on Telegram and send one quotation each. You compare them on
          Telegram, choose one, and you both get each other&apos;s number.
        </p>
      </div>
      <div className="rounded-[28px] border border-[var(--line)] p-5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.25)] sm:p-7">{children}</div>
    </div>
  );
}

function TicketCard({ t }: { t: TicketView }) {
  const stage = t.matchedWith ? 4 : t.summarySent ? 3 : t.quoted + t.declined > 0 ? 2 : t.asked > 0 ? 1 : 0;
  const steps = ["Sent", "Quotes coming in", "Bids on Telegram", "Matched"];
  return (
    <article className="space-y-3.5 rounded-[20px] border border-[var(--line)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-[family-name:var(--font-display)] text-lg tracking-tight">{t.title}</b>
        <span className="font-mono text-xs text-[var(--muted)]">
          {t.id}
          {t.start ? ` · from ${formatDate(t.start)}` : ""}
          {t.days ? ` · ${t.days} days` : ""}
        </span>
      </div>
      <div className="cb-track" aria-label={`Progress: ${steps[Math.max(0, stage - 1)] ?? "not sent"}`}>
        {steps.map((label, i) => (
          <span key={label} data-on={i < stage}>
            {label}
          </span>
        ))}
      </div>
      {t.matchedWith ? (
        <p className="text-sm">
          <b>Matched with {t.matchedWith}.</b> You both have each other&apos;s number on Telegram.
        </p>
      ) : t.asked === 0 ? (
        <p className="text-sm text-[var(--muted)]">No available contractor on Telegram could be asked yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-6">
            {[
              [t.asked, "Asked"],
              [t.quoted, "Quoted"],
              [t.declined, "Declined"],
            ].map(([n, label]) => (
              <div key={label} className="grid">
                <b className="font-[family-name:var(--font-display)] text-2xl font-medium leading-tight tracking-tight">{n}</b>
                <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-[var(--muted)]">
            {t.summarySent
              ? "The quotations were sent to Telegram: choose one there."
              : "The quotations go to your Telegram when everyone has answered, or 10 minutes after asking."}
          </p>
        </>
      )}
    </article>
  );
}
