import Link from "next/link";
import SiteHeader from "./SiteHeader";

// Product rules, not vanity numbers.
const FACTS = [
  ["1", "quote per contractor, per job"],
  ["0", "phone numbers shared before you choose"],
  ["10 min", "at most until the quotes reach you"],
  ["3", "languages for contractors: English, Hindi, Marathi"],
];

const STEPS = [
  ["Raise a ticket", "Say what work you need, where in Pune, and from when."],
  ["Available contractors are asked", "Only those registered for that trade and area, and available on that date, get it on Telegram."],
  ["Quotes come back", "Each contractor answers Yes or No and sends one quotation."],
  ["You choose", "Compare the quotes and ratings, tap Choose, and you both get each other's number."],
];

export default function Home() {
  return (
    <>
      <SiteHeader active="home" />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-[var(--line)]">
          <div className="mx-auto grid max-w-[900px] justify-items-center gap-6 px-5 pb-16 pt-16 text-center sm:pt-20">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden="true" className="h-[18px] w-[18px] rounded-full bg-[var(--accent)] shadow-[inset_0_0_0_5px_#ffd9cc]" />
              For residential projects in Pune
            </span>
            <h1 className="cb-display">When a contractor leaves mid-way, find the next one fast.</h1>
            <p className="max-w-[600px] text-lg leading-relaxed text-[var(--muted)]">
              Raise a ticket. Available contractors for that trade and area get it on Telegram and send one quotation each. You compare
              them, choose one, and you both get each other&apos;s number.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/builder" className="inline-flex min-h-12 items-center rounded-full bg-[var(--ink)] px-6 font-semibold text-white">
                I&apos;m a builder
              </Link>
              <Link href="/register" className="inline-flex min-h-12 items-center rounded-full border border-[var(--line-strong)] px-6 font-semibold">
                I&apos;m a contractor
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1180px] grid-cols-2 gap-6 border-b border-[var(--line)] px-5 py-10 md:grid-cols-4">
          {FACTS.map(([big, small]) => (
            <div key={small} className="flex items-center gap-3">
              <b className="whitespace-nowrap font-[family-name:var(--font-display)] text-3xl font-medium leading-none tracking-tight sm:text-4xl">{big}</b>
              <span className="text-[0.72rem] font-semibold uppercase leading-snug tracking-wide text-[var(--muted)]">{small}</span>
            </div>
          ))}
        </section>

        <section className="mx-auto grid max-w-[1180px] gap-12 px-5 py-16 md:grid-cols-[1fr_1.1fr] md:py-20">
          <div className="space-y-4">
            <p className="cb-kicker">How it works</p>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">From ticket to phone number in four steps.</h2>
            <p className="text-[var(--muted)]">
              Contractors&apos; details are their own statements: Contractor Desk does not verify or vet contractors. Ratings come from
              builders who worked with them.
            </p>
            <Link href="/request" className="inline-block border-b-2 border-[var(--accent)] pb-0.5 font-semibold">
              Or send a request without signing up →
            </Link>
          </div>
          <ol className="grid gap-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="grid gap-1.5 rounded-[20px] bg-[var(--surface-2)] p-5">
                <span className="text-sm font-semibold text-[var(--accent)]">0{i + 1}</span>
                <b className="font-semibold">{title}</b>
                <span className="text-sm text-[var(--muted)]">{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-[1180px] px-5 pb-20">
          <div className="flex flex-wrap items-end justify-between gap-6 rounded-[28px] bg-[var(--ink)] p-8 text-white sm:p-10">
            <div className="max-w-[520px] space-y-3">
              <p className="text-sm font-semibold text-[#ff8a6b]">– For contractors</p>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight">Get work near you, on your phone.</h2>
              <p className="text-white/70">Register once in English, Hindi or Marathi. Jobs that match your trade, area and dates come to your Telegram.</p>
            </div>
            <Link href="/register" className="inline-flex min-h-12 items-center rounded-full bg-white px-6 font-semibold text-[var(--ink)]">
              Register as a contractor
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
