import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { raiseRequestHref } from "@/lib/fixtures";
import { todayInIndia } from "@/lib/registration";
import ContactForm from "./ContactForm";
import HomeSearch from "./HomeSearch";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Icon, type IconName } from "./ui";
import heroPhoto from "../public/images/hero.jpg";
import karigarsPhoto from "../public/images/karigars-work.jpg";

// The Mera Karigar home page: photo hero with the search pill, a trust strip,
// trades as cards, how it works, promises, the contractor band and contact.

// How each trade is usually priced, shown on its card (a quote can use any unit).
const TRADE_CARDS: { trade: string; title: string; icon: IconName; unit: string }[] = [
  { trade: "Masonry", title: "Masonry & brickwork", icon: "brick", unit: "₹ / sq ft" },
  { trade: "Plumbing", title: "Plumbing & concealed piping", icon: "drop", unit: "₹ / day" },
  { trade: "Electrical", title: "Electrical wiring & fittings", icon: "bolt", unit: "₹ / unit" },
  { trade: "Painting", title: "Painting & wall finishes", icon: "brush", unit: "₹ / sq ft" },
  { trade: "Carpentry", title: "Carpentry, doors & frames", icon: "saw", unit: "₹ / unit" },
  { trade: "Other", title: "Tiling, waterproofing & more", icon: "hammer", unit: "Any unit" },
];

const STEPS: [string, string][] = [
  ["Raise a request", "Trade, Pune locality, start date and duration. It takes about a minute, in English, Hindi or Marathi."],
  ["We match on what matters", "Only contractors with the right trade, who work in your area and are free on your date. A start up to 2 days later is shown, clearly marked."],
  ["One quote from each", "Matched contractors are asked and each sends a single price with its unit. Per-day and per-sq-ft prices are never ranked together."],
  ["You choose, then connect", "Compare prices, dates and reviews side by side. Phone numbers are shared only after you choose."],
];

const PROMISES: [IconName, string, string][] = [
  ["scale", "Like-for-like prices", "Quotes are grouped by unit, so you never compare a daily rate with a per-square-foot price by mistake."],
  ["lock", "Your number stays private", "Nobody sees your phone number until you pick a contractor. Contractors' numbers stay hidden too."],
  ["calendar", "Dates you can trust", "Availability is confirmed for each job, never assumed. A late start is always labelled, never hidden."],
];

export default function Home() {
  return (
    <>
      <SiteHeader active="home" overlay />
      <main className="flex-1">
        <section className="mk-hero">
          <Image src={heroPhoto} alt="" fill preload sizes="100vw" placeholder="blur" className="mk-hero-bg" />
          <div className="mk-hero-inner">
            <span className="mk-badge">
              <i />
              Residential sites · Pune
            </span>
            <h1 className="mk-hero-title">
              <span className="thin">Your next karigar,</span>
              <strong>without the waiting</strong>
            </h1>
            <p className="mk-hero-lead">
              When a contractor drops out, the whole site stops. Mera Karigar finds available contractors by trade, locality and
              start date, collects one quote from each, and lets you choose with confidence.
            </p>
            <Suspense fallback={<div className="mk-search" style={{ height: 74 }} />}>
              <Search />
            </Suspense>
            <p className="mk-hero-note">Free for builders · Contractors are not vetted · Availability confirmed per job</p>
          </div>
        </section>

        <section className="mk-strip" aria-label="How Mera Karigar works, in numbers">
          <div className="mk-strip-inner">
            <div className="mk-stat">
              <b>1</b>
              <span>Quote per contractor,<br />per job</span>
            </div>
            <div className="mk-stat">
              <b>+2</b>
              <span>Day start window,<br />always labelled</span>
            </div>
            <div className="mk-stat">
              <b>3</b>
              <span>Languages: English,<br /><span lang="hi">हिन्दी</span>, <span lang="mr">मराठी</span></span>
            </div>
            <div className="mk-stat">
              <b>0</b>
              <span>Numbers shared<br />before you choose</span>
            </div>
          </div>
        </section>

        <section id="trades" className="mk-section">
          <div className="mk-section-head">
            <div>
              <span className="kicker-line">Trades we cover</span>
              <h2 className="h-display">
                The right karigar <strong>for every stage</strong>
              </h2>
            </div>
            <p className="lead">Pick the trade your site is waiting on. We ask the contractors who match and bring their quotes back to you.</p>
          </div>
          <div className="mk-trades">
            {TRADE_CARDS.map((c) => (
              <Link key={c.trade} href={raiseRequestHref({ trade: c.trade })} className="mk-trade">
                <div className="mk-trade-art">
                  <span className="tag">{c.trade === "Other" ? "More trades" : "Trade"}</span>
                  <Icon name={c.icon} size={56} />
                </div>
                <div className="mk-trade-body">
                  <span className="mk-loc">
                    <Icon name="pin" size={13} />
                    Across Pune
                  </span>
                  <h3>{c.title}</h3>
                  <div className="mk-meta">
                    <div>
                      <b>1 each</b>
                      <span>Quotes</span>
                    </div>
                    <div>
                      <b>{c.unit}</b>
                      <span>Usual pricing</span>
                    </div>
                  </div>
                  <div className="mk-trade-foot">
                    <strong>Raise a request</strong>
                    <span className="round-arrow" aria-hidden="true">
                      <Icon name="arrowUpRight" size={18} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section id="how" className="mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-how">
            <div className="mk-photo">
              <Image src={karigarsPhoto} alt="Two construction workers at a site in India" fill sizes="(max-width: 960px) 100vw, 600px" placeholder="blur" />
              <div className="mk-photo-tag">
                <div>
                  <b>Karigars near your site</b>
                  <span>Matched by trade, area and date</span>
                </div>
                <span className="round-arrow" aria-hidden="true">
                  <Icon name="pin" size={18} />
                </span>
              </div>
            </div>
            <div>
              <span className="kicker-line">How it works</span>
              <h2 className="h-display" style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", marginTop: 12 }}>
                From &ldquo;our plumber left&rdquo; <strong>to a chosen karigar</strong>
              </h2>
              <ol className="mk-steps">
                {STEPS.map(([title, text], i) => (
                  <li key={title}>
                    <span className="n">0{i + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div style={{ marginTop: 28 }}>
                <Link className="btn btn-primary btn-lg" href={raiseRequestHref()}>
                  Raise a request <Icon name="arrow" size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-section-head">
            <div>
              <span className="kicker-line">Why builders use it</span>
              <h2 className="h-display">
                Built on <strong>fair, clear rules</strong>
              </h2>
            </div>
          </div>
          <div className="mk-promises">
            {PROMISES.map(([icon, title, text]) => (
              <div key={title} className="mk-promise">
                <span className="ic">
                  <Icon name={icon} size={22} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mk-band" aria-label="For contractors">
          <div className="mk-band-inner">
            <div className="mk-band-copy">
              <span className="kicker-line light">For karigars</span>
              <h2 className="h-display">
                Get nearby jobs, <strong>in your language</strong>
              </h2>
              <p className="lead">Register once with your trade, area and availability. No password, no app to install, and your number stays private.</p>
              <div className="row wrap">
                <Link className="btn btn-gold btn-lg" href="/register">
                  Register as a contractor
                </Link>
                <span className="lang-chips">
                  <span>English</span>
                  <span lang="hi">हिन्दी</span>
                  <span lang="mr">मराठी</span>
                </span>
              </div>
            </div>
            <div className="mk-band-img">
              <Image src={karigarsPhoto} alt="" fill sizes="(max-width: 900px) 100vw, 560px" style={{ objectPosition: "70% 40%" }} />
            </div>
          </div>
        </section>

        <section id="contact" className="mk-section" style={{ paddingTop: 0 }}>
          <div className="mk-contact">
            <div>
              <span className="kicker-line">Contact us</span>
              <h2 className="h-display" style={{ marginTop: 12 }}>
                Questions? <strong>Ask us anything</strong>
              </h2>
              <p className="lead" style={{ marginTop: 16 }}>Builders, site engineers and contractors: send a message and we&apos;ll reply by email within 1–2 working days.</p>
              <ul className="mk-contact-points">
                <li>
                  <span className="ic"><Icon name="mail" size={18} /></span>
                  You get an email confirmation straight away
                </li>
                <li>
                  <span className="ic"><Icon name="lock" size={18} /></span>
                  We use your email only to reply to you
                </li>
              </ul>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

// Today's date (India) for the search bar, read per request.
async function Search() {
  await connection();
  return <HomeSearch today={todayInIndia()} target={raiseRequestHref()} />;
}
