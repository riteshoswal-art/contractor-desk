import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { raiseRequestHref } from "@/lib/fixtures";
import { todayInIndia } from "@/lib/registration";
import HomeSearch from "./HomeSearch";
import SiteHeader from "./SiteHeader";
import { Icon, Roads, type IconName } from "./ui";

// The Concept B home page (ui-demos/concept-b-editorial, "Home").
const STEPS: [IconName, string, string][] = [
  ["file", "Raise a request", "Trade, Pune locality, start date and duration. Takes about a minute."],
  ["pin", "Matched on what matters", "Trade and locality must fit. A start up to 2 days later is shown, clearly marked as unconfirmed."],
  ["scale", "One bid each", "Available contractors get the job on Telegram and send one price with its unit. Prices are only compared like for like."],
  ["shield", "You choose", "Compare prices, dates and reviews. Contact details are shared only after you choose."],
];

export default function Home() {
  return (
    <>
      <SiteHeader active="home" />
      <main className="flex-1">
        <section className="ed-hero">
          <div className="map-faint" aria-hidden="true">
            <Roads />
          </div>
          <div className="ed-hero-inner">
            <span className="kicker">
              <span className="dot" />
              For residential sites in Pune
            </span>
            <h1 className="h-display">
              Keep your site moving when a contractor{" "}
              <span className="ink-chip">
                <Icon name="users" size={26} />
              </span>{" "}
              drops&nbsp;out
            </h1>
            <p className="lead">
              Raise a job request for your site. We find contractors by trade, locality and start date, collect one bid from each,
              and you compare like for like.
            </p>
            <Suspense fallback={<div className="searchbar" style={{ height: 66 }} />}>
              <Search />
            </Suspense>
            <p className="tiny muted" style={{ margin: 0 }}>
              Contractors are not vetted. Availability is confirmed per job, never assumed.
            </p>
          </div>
        </section>

        <section className="facts">
          <div>
            <b>1</b>
            <span>
              bid per contractor
              <br />
              per job
            </span>
          </div>
          <div>
            <b>+2</b>
            <span>
              day start-date window,
              <br />
              always labelled
            </span>
          </div>
          <div>
            <b>3</b>
            <span>
              languages: English,
              <br />
              <span lang="hi">हिन्दी</span>, <span lang="mr">मराठी</span>
            </span>
          </div>
          <div>
            <b>0</b>
            <span>
              phone numbers shown
              <br />
              before you choose
            </span>
          </div>
        </section>

        <section className="ed-split page-pad">
          <div className="stack" style={{ ["--gap" as string]: "20px" }}>
            <span className="kicker-line">How it works</span>
            <h2 className="h-display h-display-sm">From &ldquo;our plumber left&rdquo; to a chosen contractor</h2>
            <p className="lead">We do the matching and the follow-up. You make the choice, with prices, dates and reviews side by side.</p>
            <div>
              <Link className="btn btn-primary" href={raiseRequestHref()}>
                Raise a request <Icon name="arrow" size={16} />
              </Link>
            </div>
          </div>
          <div className="grid grid-2">
            {STEPS.map(([icon, title, text], i) => (
              <div key={title} className="card flat step-card">
                <span className="step-n">0{i + 1}</span>
                <Icon name={icon} size={22} />
                <h3 className="h3">{title}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="band page-pad">
          <div className="band-inner">
            <div className="stack" style={{ ["--gap" as string]: "12px" }}>
              <span className="kicker-line light">For contractors</span>
              <h2 className="h1">Register once, in your language</h2>
              <p className="lead">Name, trade, area and availability. No password, no app to install. Your number stays private.</p>
            </div>
            <div className="row wrap">
              <Link className="btn btn-primary on-dark" href="/register">
                Register as a contractor
              </Link>
              <span className="lang-chips">
                <span>English</span>
                <span lang="hi">हिन्दी</span>
                <span lang="mr">मराठी</span>
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

// Today's date (India) for the search bar, read per request.
async function Search() {
  await connection();
  return <HomeSearch today={todayInIndia()} target={raiseRequestHref()} />;
}
