/* Contractor Desk UI demos: every screen, shared by the three concepts.
 *
 * A concept calls CD.mount({ variant }) with "calm", "editorial" or "console".
 * The variant changes the page shell and a few layouts (home, overview, the
 * bid comparison); the colours, type and shapes come from the concept's CSS.
 * Nothing here talks to a server: it is a clickable mock-up with sample data.
 */
(function () {
  "use strict";

  const D = window.CD_DATA;

  const SCREENS = [
    { id: "home", label: "Home" },
    { id: "request", label: "Raise request" },
    { id: "register", label: "Contractor sign-up" },
    { id: "bid", label: "Contractor bid" },
    { id: "overview", label: "Operator overview" },
    { id: "detail", label: "Compare & choose" },
    { id: "review", label: "Developer review" },
  ];

  const state = {
    variant: "calm",
    screen: "home",
    req: { step: 1, done: false, errors: {}, data: { description: "", trade: "", area: "", start: "2026-10-27", days: "14", notes: "", name: "", phone: "", consent: false } },
    reg: { lang: "en", done: false, errors: {}, data: { name: "", trade: "", area: "", availability: "now", from: "", phone: "", consent: false } },
    bid: { lang: "en", as: "exact", done: false, errors: {}, data: { amount: "", unit: "", notes: "" } },
    rev: { lang: "en", done: false, errors: {}, data: { overall: 0, workmanship: 0, punctuality: 0, communication: 0, comment: "" } },
    detail: { tab: "bids", unit: "all", focus: "C-SAMPLE0A", selected: null, contact: false, completed: false, link: false, history: [] },
  };

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const inr = (n) =>
    "₹" + new Intl.NumberFormat("en-IN", Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const longDate = (iso) => { const [y, m, d] = iso.split("-"); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; };
  const dmy = (iso) => iso.split("-").reverse().join("-");
  const byId = (id) => D.contractors.find((c) => c.id === id);
  const T = (screen) => D.text[state[screen].lang];
  const firstName = (c) => c.name.split(" ")[0];

  const ICON_PATHS = {
    check: "M5 12.5l4.2 4.2L19 7",
    cal: "M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z",
    pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z",
    star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z",
    arrow: "M5 12h14M13 6l6 6-6 6",
    back: "M19 12H5M11 18l-6-6 6-6",
    info: "M12 8h.01M11 12h1v5h1M12 21a9 9 0 100-18 9 9 0 000 18z",
    lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z",
    clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
    users: "M16 20v-1.5A3.5 3.5 0 0012.5 15h-5A3.5 3.5 0 004 18.5V20M10 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15.5 4.6a3.5 3.5 0 010 6.8",
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
    globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18",
    scale: "M12 4v16M5 20h14M6 8l-3 6a3 3 0 006 0L6 8zm12 0l-3 6a3 3 0 006 0l-3-6zM6 8h12",
    shield: "M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z",
    plus: "M12 5v14M5 12h14",
    copy: "M9 9h10v10H9zM5 15V5h10",
    home: "M4 11l8-7 8 7M6 9.5V20h12V9.5",
    file: "M7 3h7l5 5v13H7zM14 3v5h5",
    phone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
    chat: "M5 5h14v10H9l-4 4z",
  };
  const icon = (name, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;

  const logo = () =>
    `<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="currentColor"/><path d="M7 19h14M9 19v-6h4v6M15 19V9h4v10" stroke="var(--logo-ink, #fff)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // ------------------------------------------------------------------ shell
  function navLinks() {
    const area = { home: "home", request: "request", register: "register", bid: "register", overview: "overview", detail: "overview", review: "home" }[state.screen];
    const links = [
      ["home", "Home"],
      ["request", "Raise a request"],
      ["register", "For contractors"],
      ["overview", "Operator"],
    ];
    return links.map(([id, label]) => `<a href="#${id}" class="nav-link${area === id ? " active" : ""}">${label}</a>`).join("");
  }

  function shell() {
    const dock = `<nav class="dock" aria-label="Demo screens">
      <a class="home" href="../index.html">← All concepts</a>
      ${SCREENS.map((s) => `<a href="#${s.id}" data-dock="${s.id}">${s.label}</a>`).join("")}
    </nav>`;

    if (state.variant === "console") {
      const group = (title, items) => `<div class="side-group"><p class="side-title">${title}</p>${items
        .map(([id, label, ic]) => `<a href="#${id}" class="side-link" data-side="${id}">${icon(ic)}<span>${label}</span></a>`)
        .join("")}</div>`;
      return `<div class="console">
        <aside class="sidebar glass">
          <a class="brand" href="#home">${logo()}<span>Contractor Desk</span></a>
          ${group("Operator", [["overview", "Overview", "grid"], ["detail", "Compare & choose", "scale"]])}
          ${group("Public pages", [["home", "Home", "home"], ["request", "Raise a request", "file"], ["register", "Contractor sign-up", "users"]])}
          ${group("Private links", [["bid", "Contractor bid", "phone"], ["review", "Developer review", "star"]])}
          <div class="side-foot"><span class="pill pill-warn plain">Sample data</span><a class="side-link" href="../index.html">${icon("back")}<span>All concepts</span></a></div>
        </aside>
        <div class="console-main"><main id="view"></main></div>
      </div>
      <nav class="dock console-dock" aria-label="Demo screens">${SCREENS.map((s) => `<a href="#${s.id}" data-dock="${s.id}">${s.label}</a>`).join("")}</nav>`;
    }

    return `<header class="topbar">
        <div class="topnav glass">
          <a class="brand" href="#home">${logo()}<span>Contractor Desk</span></a>
          <nav class="nav-links" aria-label="Main">${navLinks()}</nav>
          <div class="row nav-end"><span class="pill pill-warn plain">Sample data</span><span class="avatar" title="Founder (operator)">F</span></div>
        </div>
      </header>
      <main id="view"></main>${dock}`;
  }

  // ------------------------------------------------------------------ shared bits
  const langSeg = (screen) => `<div class="seg" role="group" aria-label="Language">${["en", "hi", "mr"]
    .map((l) => `<button type="button" data-action="lang" data-screen="${screen}" data-lang="${l}" class="${state[screen].lang === l ? "on" : ""}" lang="${l}">${D.text[l].langName}</button>`)
    .join("")}</div>`;

  const err = (e) => (e ? `<p class="error" role="alert">${esc(e)}</p>` : "");

  function phoneStage(explain, body, lang) {
    return `<div class="device-stage">
      <div class="explain stack">${explain}</div>
      <div class="phone"><div class="phone-screen" lang="${lang}">
        <div class="phone-status"><span>9:41</span><span>●●● ▮</span></div>
        <div class="phone-body">${body}</div>
      </div></div>
    </div>`;
  }

  const fitPill = (c) =>
    c.fit === "exact"
      ? `<span class="pill pill-ok">On the requested date</span>`
      : c.fit === "near1"
        ? `<span class="pill pill-warn">1 day later · needs confirmation</span>`
        : `<span class="pill pill-info">2 days later</span>`;

  const standingPill = (c) => {
    if (state.detail.selected === c.id) return `<span class="pill pill-dark plain">${icon("check", 14)} Selected</span>`;
    if (c.standing === "provisional") return `<span class="pill pill-warn">Provisional · date not confirmed</span>`;
    return `<span class="pill pill-ok">Can be selected</span>`;
  };

  const ratingLine = (c) => {
    if (!c.rating) return `<span class="muted">Not yet rated</span>`;
    const few = c.rating.count < 3 ? ` · <span class="muted">too few to judge</span>` : "";
    return `<span class="rating"><span class="star-i">${icon("star", 15)}</span><strong>${c.rating.average.toFixed(1)}</strong> <span class="muted">from ${c.rating.count} review${c.rating.count === 1 ? "" : "s"}</span>${few}</span>`;
  };

  const criteria = (c) =>
    c.rating && c.rating.criteria.length
      ? `<div class="criteria">${c.rating.criteria
          .map(([label, avg, n]) => `<div class="crit"><span class="small muted">${label}</span><div class="meter"><i style="width:${(avg / 5) * 100}%"></i></div><span class="small">${avg.toFixed(1)} <span class="muted">(${n})</span></span></div>`)
          .join("")}</div>`
      : "";

  const comments = (c) =>
    c.comments.length
      ? `<div class="stack" style="--gap:8px">${c.comments
          .map(
            (q) => `<p class="quote" ${q.lang !== "en" ? `lang="${q.lang}"` : ""}>“${esc(q.text)}”<span class="meta" lang="en">${q.score}/5 · ${longDate(q.date)}${q.lang === "hi" ? " · Hindi, as written" : ""}${q.pending ? " · English version pending" : ""}</span></p>`,
          )
          .join("")}</div>`
      : "";

  const price = (c) => `<div class="price">${inr(c.bid.amount)}<span class="per">${D.units[c.bid.unit]}</span></div>`;

  const selectButton = (c, block) => {
    if (!state.detail.selected && c.standing === "eligible")
      return `<button class="btn btn-primary${block ? " btn-block" : ""}" data-action="ask-select" data-id="${c.id}">Select ${esc(firstName(c))}</button>`;
    if (!state.detail.selected && c.standing === "provisional")
      return `<button class="btn btn-ghost${block ? " btn-block" : ""}" data-action="confirm-date" data-id="${c.id}">${icon("cal", 16)} Confirm start date first</button>`;
    return "";
  };

  // ------------------------------------------------------------------ HOME
  function searchBar() {
    const trades = Object.keys(D.text.en.trades);
    const areas = Object.keys(D.text.en.areas);
    return `<form class="searchbar glass" data-action="start-request">
      <label class="sb-seg"><span class="sb-label">Trade needed</span>
        <select class="sb-input" name="trade">${trades.map((t) => `<option ${t === "Plumbing" ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="sb-seg"><span class="sb-label">Site locality</span>
        <select class="sb-input" name="area">${areas.map((a) => `<option ${a === "Baner" ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <label class="sb-seg"><span class="sb-label">Needed from</span>
        <input class="sb-input" type="date" name="start" value="2026-10-27"></label>
      <button class="btn btn-primary sb-go" type="submit" aria-label="Raise a request">${icon("arrow")}<span class="sb-go-text">Raise request</span></button>
    </form>`;
  }

  const STEPS = [
    ["file", "Raise a request", "Trade, Pune locality, start date and duration. Write in English, Hindi or Marathi."],
    ["pin", "Matched on what matters", "Trade and locality must fit. A start up to 2 days later is shown, clearly marked as unconfirmed."],
    ["scale", "One bid each", "Each invited contractor sends one price with its unit. Prices are only compared like for like."],
    ["shield", "You choose", "Compare price, confirmed dates and real reviews. Contact details are shared only after you choose."],
  ];

  const PRINCIPLES = [
    ["scale", "Like-for-like prices", "₹/sq ft and ₹/day are never ranked against each other."],
    ["cal", "Honest availability", "A start date counts only once it is confirmed for your job."],
    ["star", "Real reviews only", "Reviews come from completed jobs. No reviews means “Not yet rated”."],
    ["globe", "Three languages", "English, हिन्दी and मराठी for every contractor screen."],
  ];

  function miniCompare() {
    const rows = D.contractors.filter((c) => c.bid && c.bid.unit === "per_sqft");
    return `<div class="card mini-compare">
      <div class="row between"><span class="h3">Priced per square foot</span><span class="pill pill-muted plain">Sample</span></div>
      ${rows
        .map(
          (c) => `<div class="mini-row"><span class="avatar">${c.initials}</span><div class="grow"><div class="h3">${esc(c.name)}</div><div class="small muted">${c.rating ? `${c.rating.average.toFixed(1)} ★ · ${c.rating.count} reviews` : "Not yet rated"}</div></div><div class="right"><div class="h3">${inr(c.bid.amount)}<span class="small muted"> /sq ft</span></div>${c.standing === "provisional" ? `<span class="pill pill-warn">Date not confirmed</span>` : `<span class="pill pill-ok">Can be selected</span>`}</div></div>`,
        )
        .join("")}
      <p class="tiny muted" style="margin:10px 0 0">₹/day and fixed-price bids appear in their own groups, never in this list.</p>
    </div>`;
  }

  function home() {
    const v = state.variant;
    if (v === "editorial") {
      return `<section class="ed-hero">
          <div class="map-faint" aria-hidden="true">${roads()}</div>
          <div class="ed-hero-inner">
            <span class="kicker"><span class="dot"></span>Early experiment in Pune</span>
            <h1 class="h-display">Keep your site moving when a contractor <span class="ink-chip">${icon("users", 26)}</span> drops&nbsp;out</h1>
            <p class="lead">Raise a job request for your site. We find contractors by trade, locality and start date, collect one bid from each, and you compare like for like.</p>
            ${searchBar()}
            <p class="tiny muted">Contractors are not vetted. Availability is confirmed per job, never assumed.</p>
          </div>
        </section>
        <section class="facts">
          <div><b>1</b><span>bid per contractor<br>per job</span></div>
          <div><b>+2</b><span>day start-date window,<br>always labelled</span></div>
          <div><b>3</b><span>languages: English,<br>हिन्दी, मराठी</span></div>
          <div><b>0</b><span>phone numbers shown<br>before you choose</span></div>
        </section>
        <section class="ed-split page-pad">
          <div class="stack" style="--gap:20px">
            <span class="kicker-line">How it works</span>
            <h2 class="h-display h-display-sm">From “our plumber left” to a chosen contractor</h2>
            <p class="lead">We do the matching and the follow-up. You make the choice, with prices, dates and reviews side by side.</p>
            <a class="btn btn-primary" href="#request">Raise a request ${icon("arrow", 16)}</a>
          </div>
          <div class="grid grid-2">${STEPS.map(([ic, t, d], i) => `<div class="card flat step-card"><span class="step-n">0${i + 1}</span>${icon(ic, 22)}<h3 class="h3">${t}</h3><p class="small muted">${d}</p></div>`).join("")}</div>
        </section>
        <section class="band page-pad">
          <div class="band-inner">
            <div class="stack" style="--gap:12px"><span class="kicker-line light">For contractors</span><h2 class="h1">Register once, in your language</h2><p class="lead">Name, trade, area and availability. No password, no app to install. Your number stays private.</p></div>
            <div class="row wrap"><a class="btn btn-primary on-dark" href="#register">Register as a contractor</a><span class="lang-chips"><span>English</span><span lang="hi">हिन्दी</span><span lang="mr">मराठी</span></span></div>
          </div>
        </section>`;
    }

    if (v === "console") {
      return `<div class="page console-home">
        <section class="split-hero">
          <div class="stack" style="--gap:20px">
            <span class="pill pill-muted plain">${icon("pin", 14)} Pune · early experiment</span>
            <h1 class="h-display">Find a replacement contractor before your site goes idle.</h1>
            <p class="lead">Raise a request. Contractors are matched by trade, locality and start date, each sends one bid, and you compare like for like.</p>
            <div class="row wrap"><a class="btn btn-primary" href="#request">Raise a request</a><a class="btn btn-ghost" href="#register">I'm a contractor</a></div>
            <p class="tiny muted">Contractors are not vetted. Availability is confirmed per job, never assumed.</p>
          </div>
          <div class="preview">${miniCompare()}<div class="map small-map">${mapInner(true)}</div></div>
        </section>
        <section class="grid grid-4" style="margin-top:40px">${PRINCIPLES.map(([ic, t, d]) => `<div class="card flat"><span class="ic-box">${icon(ic)}</span><h3 class="h3" style="margin-top:12px">${t}</h3><p class="small muted" style="margin:6px 0 0">${d}</p></div>`).join("")}</section>
      </div>`;
    }

    // calm
    return `<div class="page">
      <section class="calm-hero">
        <span class="pill pill-muted plain">${icon("pin", 14)} Pune · early experiment</span>
        <h1 class="h-display">Find a replacement contractor before your site goes idle.</h1>
        <p class="lead">Raise a job request. We match contractors by trade, locality and start date, collect one bid from each, and you compare like for like.</p>
        ${searchBar()}
        <p class="tiny muted">Contractors are not vetted. Availability is confirmed per job, never assumed.</p>
      </section>
      <section class="grid grid-4 steps">${STEPS.map(([ic, t, d], i) => `<div class="card"><div class="row between"><span class="ic-box">${icon(ic)}</span><span class="step-n">${i + 1}</span></div><h3 class="h3" style="margin-top:16px">${t}</h3><p class="small muted" style="margin:6px 0 0">${d}</p></div>`).join("")}</section>
      <section class="grid grid-2" style="margin-top:16px">
        <div class="card stack" style="--gap:14px"><span class="eyebrow">What you compare</span>${miniCompare().replace('class="card mini-compare"', 'class="mini-compare"')}</div>
        <div class="card stack" style="--gap:14px">
          <span class="eyebrow">For contractors</span>
          <h2 class="h1">Register once, in your language</h2>
          <p class="muted" style="margin:0">Name, trade, area and availability. No password and no app to install. The mobile number stays private.</p>
          <div class="row wrap"><span class="chip">English</span><span class="chip" lang="hi">हिन्दी</span><span class="chip" lang="mr">मराठी</span></div>
          <div><a class="btn btn-primary" href="#register">Register as a contractor</a></div>
        </div>
      </section>
      <section class="grid grid-4" style="margin-top:16px">${PRINCIPLES.map(([ic, t, d]) => `<div class="card flat tint"><span class="ic-box">${icon(ic)}</span><h3 class="h3" style="margin-top:12px">${t}</h3><p class="small muted" style="margin:6px 0 0">${d}</p></div>`).join("")}</section>
    </div>`;
  }

  // ------------------------------------------------------------------ REQUEST (developer)
  function request() {
    const r = state.req;
    const d = r.data;
    const e = r.errors;
    const steps = ["Describe", "Details", "Contact"];
    const stepper = `<div class="stepper" aria-label="Step ${r.step} of 3">${steps
      .map((s, i) => `<div class="step ${i + 1 < r.step ? "done" : i + 1 === r.step ? "now" : ""}"><div class="bar"><i></i></div><div class="cap">${i + 1}. ${s}</div></div>`)
      .join("")}</div>`;

    const summary = `<aside class="card tint stack summary" style="--gap:14px">
      <span class="eyebrow">Your request</span>
      ${[
        ["Trade", d.trade || "—"],
        ["Locality", d.area ? `${d.area}, Pune` : "—"],
        ["Needed from", d.start ? longDate(d.start) : "—"],
        ["Duration", d.days ? `About ${d.days} days` : "—"],
      ]
        .map(([k, val]) => `<div class="row between"><span class="muted small">${k}</span><span class="h3">${esc(val)}</span></div>`)
        .join("")}
      <hr class="divider">
      <div class="stack small" style="--gap:10px">
        <div class="row" style="align-items:flex-start">${icon("lock", 16)}<span>Your number is kept private and is not sent to any AI service.</span></div>
        <div class="row" style="align-items:flex-start">${icon("info", 16)}<span>Saving a request does not contact any contractor. We match and confirm availability first.</span></div>
      </div>
    </aside>`;

    if (r.done) {
      return `<div class="page narrow"><div class="card done-card stack" style="--gap:18px">
        <span class="done-ic">${icon("check", 30)}</span>
        <h1 class="h1">Request received</h1>
        <p class="lead">It is stored privately. No contractor has been contacted or matched yet.</p>
        <ol class="timeline">
          <li class="now"><b>Matching</b><span>Contractors who fit the trade, locality and start date are found.</span></li>
          <li><b>Confirming dates</b><span>Anyone starting up to 2 days later is asked to confirm first.</span></li>
          <li><b>Bids</b><span>Each invited contractor sends one price. You get a like-for-like comparison.</span></li>
          <li><b>Your choice</b><span>Contact details are shared only after you choose.</span></li>
        </ol>
        <div class="row wrap"><button class="btn btn-primary" data-action="req-reset">Raise another request</button><a class="btn btn-ghost" href="#detail">See what the comparison looks like</a></div>
      </div></div>`;
    }

    let body = "";
    if (r.step === 1) {
      body = `<div class="stack" style="--gap:18px">
        <div><h1 class="h1">What happened, and what do you need?</h1><p class="muted" style="margin:6px 0 0">Write it in your own words, in English, Hindi or Marathi. You check every detail before anything is saved.</p></div>
        <label class="field"><span class="sr-only">Description</span>
          <textarea class="textarea" data-bind="req.description" maxlength="1000" placeholder="e.g. Our plumbing contractor at the Baner site left halfway through. We need a replacement plumber from next Monday for about two weeks." aria-invalid="${e.description ? "true" : "false"}">${esc(d.description)}</textarea></label>
        <div class="row between"><span class="help">Please don’t include personal details.</span><button class="btn btn-quiet" type="button" data-action="req-example">Use an example</button></div>
        ${err(e.description)}
      </div>`;
    } else if (r.step === 2) {
      body = `<div class="stack" style="--gap:20px">
        <div><h1 class="h1">The job</h1><p class="muted" style="margin:6px 0 0">These decide who is matched.</p></div>
        <div class="field"><span class="label">Trade needed</span><div class="row wrap">${Object.keys(D.text.en.trades)
          .map((t) => `<button type="button" class="chip ${d.trade === t ? "on" : ""}" data-action="req-pick" data-key="trade" data-val="${t}">${t}</button>`)
          .join("")}</div>${err(e.trade)}</div>
        <div class="grid grid-2">
          <label class="field"><span class="label">Site locality in Pune</span><select class="select" data-bind="req.area" aria-invalid="${e.area ? "true" : "false"}"><option value="">Choose a locality</option>${Object.keys(D.text.en.areas)
            .map((a) => `<option ${d.area === a ? "selected" : ""}>${a}</option>`)
            .join("")}</select>${err(e.area)}</label>
          <label class="field"><span class="label">Needed from</span><input class="input" type="date" data-bind="req.start" value="${esc(d.start)}">${err(e.start)}</label>
        </div>
        <div class="grid grid-2">
          <label class="field"><span class="label">Expected duration</span><div class="suffix-input"><input class="input" inputmode="numeric" data-bind="req.days" value="${esc(d.days)}"><span>days</span></div>${err(e.days)}</label>
          <label class="field"><span class="label">Other notes <span class="opt">(optional)</span></span><input class="input" data-bind="req.notes" value="${esc(d.notes)}" placeholder="e.g. Work on floors 3 to 5"></label>
        </div>
      </div>`;
    } else {
      body = `<div class="stack" style="--gap:20px">
        <div><h1 class="h1">How we reach you</h1><p class="muted" style="margin:6px 0 0">Only the Contractor Desk team sees this.</p></div>
        <div class="grid grid-2">
          <label class="field"><span class="label">Your name or company</span><input class="input" data-bind="req.name" value="${esc(d.name)}" aria-invalid="${e.name ? "true" : "false"}">${err(e.name)}</label>
          <label class="field"><span class="label">Mobile number</span><input class="input" inputmode="tel" data-bind="req.phone" value="${esc(d.phone)}" placeholder="98765 43210" aria-invalid="${e.phone ? "true" : "false"}">${err(e.phone)}</label>
        </div>
        <label class="check"><input type="checkbox" data-bind="req.consent" ${d.consent ? "checked" : ""}><span>I agree that these details are stored privately and used to look for contractors for this requirement, and that I may be contacted about it. I can ask for deletion.</span></label>
        ${err(e.consent)}
      </div>`;
    }

    const nav = `<div class="row between form-nav">
      ${r.step > 1 ? `<button class="btn btn-ghost" type="button" data-action="req-back">${icon("back", 16)} Back</button>` : `<span></span>`}
      <button class="btn btn-primary" type="button" data-action="req-next">${r.step === 3 ? "Save request" : "Continue"} ${icon("arrow", 16)}</button>
    </div>`;

    return `<div class="page"><div class="form-layout">
      <section class="card form-card stack" style="--gap:24px">${stepper}${body}${nav}</section>
      ${summary}
    </div></div>`;
  }

  // ------------------------------------------------------------------ REGISTER (contractor phone)
  function register() {
    const s = state.reg;
    const t = T("reg").register;
    const tr = T("reg");
    const d = s.data;
    const e = s.errors;
    const explain = `<span class="eyebrow">What a contractor sees</span>
      <h1 class="h1">Register once, on the phone, in their own language</h1>
      <p class="lead">Short, one column, big tap targets. Trade is a tap, not a typed word, so matching stays reliable.</p>
      <ul class="ticks">
        <li>${icon("globe", 16)} Switch language at any time. Labels change, the saved values don’t.</li>
        <li>${icon("lock", 16)} The mobile number is private and never shown publicly.</li>
        <li>${icon("info", 16)} It says plainly that registering is not verification or a promise of work.</li>
      </ul>`;

    const body = s.done
      ? `<div class="center-done stack" style="--gap:14px"><span class="done-ic">${icon("check", 30)}</span><h2 class="h1">${esc(t.success)}</h2><button class="btn btn-ghost" data-action="reg-reset">Start again</button></div>`
      : `<div class="stack" style="--gap:18px">
          <div class="row between"><span class="brand-sm">${logo()}</span>${langSeg("reg")}</div>
          <div><h2 class="h1">${esc(t.title)}</h2><p class="muted small" style="margin:6px 0 0">${esc(t.intro)}</p></div>
          <label class="field"><span class="label">${esc(t.name)} <span class="opt">(${esc(tr.optional)})</span></span><input class="input" data-bind="reg.name" value="${esc(d.name)}" placeholder="${esc(t.namePh)}"></label>
          <div class="field"><span class="label">${esc(t.trade)}</span><div class="row wrap">${Object.keys(tr.trades)
            .map((k) => `<button type="button" class="chip ${d.trade === k ? "on" : ""}" data-action="reg-pick" data-key="trade" data-val="${k}">${esc(tr.trades[k])}</button>`)
            .join("")}</div>${err(e.trade)}</div>
          <label class="field"><span class="label">${esc(t.area)}</span><select class="select" data-bind="reg.area" aria-invalid="${e.area ? "true" : "false"}"><option value="">—</option>${Object.keys(tr.areas)
            .map((k) => `<option value="${k}" ${d.area === k ? "selected" : ""}>${esc(tr.areas[k])}</option>`)
            .join("")}</select>${err(e.area)}</label>
          <div class="field"><span class="label">${esc(t.availability)}</span><div class="seg seg-full">${[
            ["now", t.now],
            ["from_date", t.from],
            ["unavailable", t.unavailable],
          ]
            .map(([k, label]) => `<button type="button" class="${d.availability === k ? "on" : ""}" data-action="reg-pick" data-key="availability" data-val="${k}">${esc(label)}</button>`)
            .join("")}</div>
            ${d.availability === "from_date" ? `<input class="input" type="date" style="margin-top:10px" data-bind="reg.from" value="${esc(d.from)}">` : ""}</div>
          <label class="field"><span class="label">${esc(t.phone)}</span><input class="input" inputmode="tel" data-bind="reg.phone" value="${esc(d.phone)}" placeholder="98765 43210" aria-invalid="${e.phone ? "true" : "false"}"><p class="help">${esc(t.phoneHint)}</p>${err(e.phone)}</label>
          <label class="check"><input type="checkbox" data-bind="reg.consent" ${d.consent ? "checked" : ""}><span class="small">${esc(t.consent)}</span></label>${err(e.consent)}
          <p class="notice notice-muted small" style="margin:0">${esc(t.note)}</p>
          <button class="btn btn-primary btn-block btn-lg" data-action="reg-submit">${esc(t.submit)}</button>
        </div>`;
    return `<div class="page">${phoneStage(explain, body, s.lang)}</div>`;
  }

  // ------------------------------------------------------------------ BID (contractor phone)
  function bid() {
    const s = state.bid;
    const tt = T("bid");
    const t = tt.bid;
    const d = s.data;
    const e = s.errors;
    const r = D.request;
    const provisional = s.as === "near";
    const explain = `<span class="eyebrow">Private bid link · one contractor, one job</span>
      <h1 class="h1">One price, one unit, sent once</h1>
      <p class="lead">The contractor sees only the job: trade, locality, start date and duration. Never the developer’s details or anyone else’s bid.</p>
      <div class="field"><span class="label">Preview as</span><div class="seg">${[
        ["exact", "Available on the date"],
        ["near", "Starts 1 day later"],
      ]
        .map(([k, label]) => `<button type="button" class="${s.as === k ? "on" : ""}" data-action="bid-as" data-val="${k}">${label}</button>`)
        .join("")}</div></div>
      <ul class="ticks">
        <li>${icon("scale", 16)} The unit is a required tap, so every price is comparable with others in the same unit.</li>
        <li>${icon("cal", 16)} A later starter can still bid, but is told plainly it counts only after their date is confirmed.</li>
      </ul>`;

    const job = `<div class="card tint flat job-card"><span class="eyebrow">${esc(t.job)}</span>
      <p class="h2" style="margin-top:6px">${esc(fill(t.jobLine, { trade: tt.trades[r.trade], area: tt.areas[r.area] }))}</p>
      <div class="row wrap small muted" style="margin-top:8px;gap:14px"><span class="row" style="gap:6px">${icon("cal", 15)} ${esc(fill(t.needed, { date: dmy(r.startDate) }))}</span><span class="row" style="gap:6px">${icon("clock", 15)} ${esc(fill(t.duration, { days: r.durationDays }))}</span></div></div>`;

    const body = s.done
      ? `<div class="stack" style="--gap:16px"><div class="row between"><span class="brand-sm">${logo()}</span>${langSeg("bid")}</div>${job}
          <div class="center-done stack" style="--gap:12px"><span class="done-ic">${icon("check", 30)}</span><h2 class="h2">${esc(t.thanks)}</h2>
          ${provisional ? `<p class="notice notice-warn small" style="margin:0">${esc(t.provisional)}</p>` : ""}
          <div class="card flat receipt"><div class="row between"><span class="muted small">${esc(t.amount)}</span><span class="h3">${inr(Number(d.amount))}</span></div><div class="row between"><span class="muted small">${esc(t.unit)}</span><span class="h3">${esc(t.units[d.unit])}</span></div></div>
          <button class="btn btn-quiet" data-action="bid-reset">Reset demo</button></div></div>`
      : `<div class="stack" style="--gap:18px">
          <div class="row between"><span class="brand-sm">${logo()}</span>${langSeg("bid")}</div>
          <div><h2 class="h1">${esc(t.title)}</h2><p class="muted small" style="margin:6px 0 0">${esc(t.intro)}</p></div>
          ${job}
          ${provisional ? `<p class="notice notice-warn small" style="margin:0">${icon("info", 16)}<span>${esc(t.provisional)}</span></p>` : ""}
          <label class="field"><span class="label">${esc(t.amount)}</span><div class="prefix-input"><span>₹</span><input class="input" inputmode="decimal" data-bind="bid.amount" value="${esc(d.amount)}" placeholder="0" aria-invalid="${e.amount ? "true" : "false"}"></div><p class="help">${esc(t.amountHelp)}</p>${err(e.amount)}</label>
          <div class="field"><span class="label">${esc(t.unit)}</span><div class="unit-grid">${Object.keys(t.units)
            .map((k) => `<button type="button" class="chip unit-chip ${d.unit === k ? "on" : ""}" data-action="bid-unit" data-val="${k}">${esc(t.units[k])}</button>`)
            .join("")}</div>${err(e.unit)}</div>
          <label class="field"><span class="label">${esc(t.notes)} <span class="opt">(${esc(tt.optional)})</span></span><textarea class="textarea" style="min-height:84px" data-bind="bid.notes" maxlength="500">${esc(d.notes)}</textarea></label>
          <p class="notice notice-info small" style="margin:0">${icon("lock", 16)}<span>${esc(t.once)}</span></p>
          <button class="btn btn-primary btn-block btn-lg" data-action="bid-submit">${esc(t.submit)}</button>
        </div>`;
    return `<div class="page">${phoneStage(explain, body, s.lang)}</div>`;
  }

  // ------------------------------------------------------------------ REVIEW (developer phone)
  function review() {
    const s = state.rev;
    const tt = T("rev");
    const t = tt.review;
    const d = s.data;
    const big = (key) => `<div class="stars" role="radiogroup" aria-label="${esc(t[key] || t.overall)}">${[1, 2, 3, 4, 5]
      .map((n) => `<button type="button" role="radio" aria-checked="${d[key] === n}" aria-label="${n} / 5" class="star ${d[key] >= n ? "on" : ""}" data-action="rev-star" data-key="${key}" data-val="${n}">★</button>`)
      .join("")}</div>`;
    const explain = `<span class="eyebrow">Private review link · after a completed job</span>
      <h1 class="h1">One honest review per job</h1>
      <p class="lead">Only the developer of a completed job gets this link, and it works once. The overall score is the only required field.</p>
      <ul class="ticks">
        <li>${icon("star", 16)} Ratings show the number of reviews, and fewer than three is marked “too few to judge”.</li>
        <li>${icon("globe", 16)} Feedback is kept exactly as written. An English version appears only when one really exists.</li>
      </ul>`;
    const body = s.done
      ? `<div class="center-done stack" style="--gap:14px"><span class="done-ic">${icon("check", 30)}</span><h2 class="h1">${esc(t.thanks)}</h2><button class="btn btn-ghost" data-action="rev-reset">Reset demo</button></div>`
      : `<div class="stack" style="--gap:18px">
          <div class="row between"><span class="brand-sm">${logo()}</span>${langSeg("rev")}</div>
          <div><h2 class="h1">${esc(t.title)}</h2><p class="muted small" style="margin:6px 0 0">${esc(t.intro)}</p></div>
          <div class="card tint flat"><span class="eyebrow">${esc(t.job)}</span><p class="h3" style="margin-top:6px">${esc(fill(D.text[s.lang].bid.jobLine, { trade: tt.trades.Plumbing, area: tt.areas.Baner }))}</p><p class="small muted" style="margin:4px 0 0">27-10-2026 → 09-11-2026</p></div>
          <div class="field"><span class="label">${esc(t.overall)} *</span><p class="help" style="margin:0 0 8px">${esc(t.overallHelp)}</p>${big("overall")}${err(s.errors.overall)}</div>
          ${["workmanship", "punctuality", "communication"]
            .map((k) => `<div class="field"><span class="label">${esc(t[k])} <span class="opt">(${esc(tt.optional)})</span></span>${big(k).replace(/class="stars"/, 'class="stars stars-sm"')}</div>`)
            .join("")}
          <label class="field"><span class="label">${esc(t.comment)} <span class="opt">(${esc(tt.optional)})</span></span><textarea class="textarea" style="min-height:90px" data-bind="rev.comment" maxlength="600">${esc(d.comment)}</textarea><p class="help">${esc(t.commentHelp)}</p></label>
          <button class="btn btn-primary btn-block btn-lg" data-action="rev-submit">${esc(t.submit)}</button>
        </div>`;
    return `<div class="page">${phoneStage(explain, body, s.lang)}</div>`;
  }

  // ------------------------------------------------------------------ OVERVIEW (operator)
  const statePill = (st) =>
    ({
      "Bidding open": "pill-info",
      "Awaiting matches": "pill-warn",
      "Contractor selected": "pill-dark",
      "New requirement": "pill-muted",
      "Job completed": "pill-ok",
    })[st] || "pill-muted";

  function stats() {
    const items = [
      ["Open requests", 4, "Not yet completed"],
      ["Bidding open", 1, "4 bids received"],
      ["Needs date confirmation", 1, "Sunil M. · R-SAMPLE01"],
      ["Reviews received", 3, "From completed jobs"],
    ];
    return items.map(([k, n, sub]) => `<div class="card stat"><span class="small muted">${k}</span><b class="stat-n">${n}</b><span class="tiny muted">${sub}</span></div>`).join("");
  }

  function requestTable() {
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Request</th><th>Needed from</th><th>Duration</th><th>Matches</th><th>Bids</th><th>Status</th></tr></thead>
      <tbody>${D.requests
        .map(
          (q) => `<tr data-action="open-request" data-id="${q.id}" tabindex="0"><td><div class="h3">${q.trade} in ${q.area}</div><div class="mono muted">${q.id}</div></td><td>${longDate(q.start)}</td><td>${q.days} days</td><td>${q.matches}</td><td>${q.bids || "—"}</td><td><span class="pill ${statePill(q.state)}">${q.state}</span></td></tr>`,
        )
        .join("")}</tbody></table></div>`;
  }

  function attention() {
    return `<div class="card stack" style="--gap:12px">
      <div class="row between"><h2 class="h2">Needs your attention</h2><span class="pill pill-muted plain">3</span></div>
      ${[
        ["cal", "Confirm Sunil M.’s start date", "R-SAMPLE01 · bid is provisional until then", "detail"],
        ["users", "Only 2 matches for Electrical in Wakad", "R-SAMPLE02 · consider inviting more", "overview"],
        ["star", "Send a review link", "R-SAMPLE05 · job completed 9 Nov", "overview"],
      ]
        .map(([ic, t, s, go]) => `<a class="attn pressable" href="#${go}"><span class="ic-box">${icon(ic)}</span><span class="grow"><span class="h3 block">${t}</span><span class="small muted">${s}</span></span>${icon("arrow", 16)}</a>`)
        .join("")}
    </div>`;
  }

  function overview() {
    const v = state.variant;
    const head = `<div class="row between wrap page-head"><div><span class="eyebrow">Operator · sample data</span><h1 class="h1" style="margin-top:4px">Requests</h1></div><div class="row"><span class="chip">${icon("pin", 14)} All Pune</span><span class="chip">Last 30 days</span></div></div>`;
    if (v === "console") {
      return `<div class="page wide">
        ${head}
        <div class="filters row wrap"><span class="chip on">All 5</span><span class="chip">Bidding open</span><span class="chip">Awaiting matches</span><span class="chip">Selected</span><span class="chip">Completed</span></div>
        <div class="console-split">
          <div class="stack" style="--gap:12px">${D.requests
            .map(
              (q) => `<button class="req-row pressable ${q.id === "R-SAMPLE01" ? "focus" : ""}" data-action="open-request" data-id="${q.id}"><span class="ic-box">${icon("file")}</span><span class="grow"><span class="h3 block">${q.trade} in ${q.area}</span><span class="small muted">${longDate(q.start)} · ${q.days} days · ${q.matches} matches${q.bids ? ` · ${q.bids} bids` : ""}</span></span><span class="pill ${statePill(q.state)}">${q.state}</span></button>`,
            )
            .join("")}</div>
          <div class="stack" style="--gap:12px"><div class="map tall">${mapInner(false)}</div><div class="grid grid-2">${stats()}</div></div>
        </div>
      </div>`;
    }
    if (v === "editorial") {
      return `<div class="page">
        ${head}
        <div class="facts facts-inline">${[
          ["4", "open requests"],
          ["1", "bidding open"],
          ["1", "start date to confirm"],
          ["3", "reviews received"],
        ]
          .map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`)
          .join("")}</div>
        <div class="card flat" style="padding:8px 8px 0">${requestTable()}</div>
        <div style="margin-top:16px">${attention()}</div>
      </div>`;
    }
    return `<div class="page">
      ${head}
      <div class="grid grid-4">${stats()}</div>
      <div class="overview-grid">
        <div class="card" style="padding:8px 8px 0">${requestTable()}</div>
        <div class="stack" style="--gap:16px">${attention()}<div class="map">${mapInner(false)}</div></div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------------ MAP (schematic)
  function roads() {
    return `<svg class="roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="var(--map-road, #d9dcdb)" stroke-width="0.6" vector-effect="non-scaling-stroke">
        <path d="M0 52 C20 48 30 44 50 47 S80 52 100 46"/><path d="M8 0 C14 30 22 60 30 100"/><path d="M60 0 C58 30 62 60 56 100"/>
        <path d="M0 28 C30 34 60 26 100 32"/><path d="M0 80 C30 74 70 82 100 76"/><path d="M85 0 C80 40 90 70 86 100"/>
        <path d="M30 20 L46 46 L70 60 L92 88"/><path d="M14 64 L36 56 L58 36 L78 18"/>
      </g>
      <path d="M0 62 C18 58 26 66 40 63 S70 54 100 60" fill="none" stroke="var(--map-river, #cfe0ea)" stroke-width="3" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  function mapInner(compact) {
    const pins = D.contractors.filter((c) => c.bid);
    // Spread around the site so the price tags never overlap (schematic only).
    const spots = [[22, 30], [58, 62], [20, 70], [62, 28]];
    return `${roads()}
      ${D.localities.map((l) => `<span class="loc" style="left:${l.x}%;top:${l.y}%">${l.name}</span>`).join("")}
      <span class="site" style="left:38%;top:46%" title="Site: Baner"></span>
      ${compact ? "" : pins.map((c, i) => `<span class="pin" style="left:${spots[i][0]}%;top:${spots[i][1]}%"><span class="avatar">${c.initials}</span>${inr(c.bid.amount)}<span class="tiny muted">${c.bid.unit === "per_sqft" ? "/sq ft" : c.bid.unit === "per_day" ? "/day" : " fixed"}</span></span>`).join("")}
      <span class="caption">Schematic, not to scale · dot = site</span>`;
  }

  // ------------------------------------------------------------------ DETAIL (compare & choose)
  function groups() {
    const live = D.contractors.filter((c) => c.bid);
    const order = ["per_sqft", "per_sqm", "per_day", "per_unit", "fixed_scope"];
    return order
      .map((u) => ({ unit: u, items: live.filter((c) => c.bid.unit === u).sort((a, b) => a.bid.amount - b.bid.amount) }))
      .filter((g) => g.items.length && (state.detail.unit === "all" || state.detail.unit === g.unit));
  }

  function bidCard(c) {
    return `<article class="card bid-card ${state.detail.selected === c.id ? "is-selected" : ""}">
      <div class="row between" style="align-items:flex-start"><div class="row"><span class="avatar">${c.initials}</span><div><div class="h3">${esc(c.name)}</div><div class="mono muted">${c.id}</div></div></div>${standingPill(c)}</div>
      ${price(c)}
      <div class="kv"><span class="row small" style="gap:8px;align-items:flex-start">${icon("cal", 16)}<span>${esc(c.startText)}</span></span><span class="row small" style="gap:8px">${ratingLine(c)}</span></div>
      ${criteria(c)}
      ${c.bid.notes ? `<p class="small notes"><span class="muted">Notes:</span> ${esc(c.bid.notes)}</p>` : ""}
      ${comments(c)}
      ${selectButton(c, true)}
    </article>`;
  }

  function bidRowsEditorial(g) {
    return `<div class="cmp-table">
      <div class="cmp-head"><span>Contractor</span><span>Price</span><span>Start date</span><span>Reviews</span><span></span></div>
      ${g.items
        .map(
          (c) => `<div class="cmp-row ${state.detail.selected === c.id ? "is-selected" : ""}">
          <div class="row"><span class="avatar">${c.initials}</span><div><div class="h3">${esc(c.name)}</div><div class="mono muted">${c.id}</div></div></div>
          <div>${price(c)}${c.bid.notes ? `<p class="tiny muted" style="margin:4px 0 0">${esc(c.bid.notes)}</p>` : ""}</div>
          <div class="small">${standingPill(c)}<p class="small muted" style="margin:6px 0 0">${esc(c.startText)}</p></div>
          <div class="small">${ratingLine(c)}${c.comments[0] ? `<p class="tiny quote-inline" ${c.comments[0].lang !== "en" ? `lang="${c.comments[0].lang}"` : ""}>“${esc(c.comments[0].text)}”${c.comments[0].pending ? `<span class="muted" lang="en"> · English version pending</span>` : ""}</p>` : ""}</div>
          <div class="cmp-act">${selectButton(c, false)}</div>
        </div>`,
        )
        .join("")}
    </div>`;
  }

  function consoleBids(gs) {
    const focus = byId(state.detail.focus) || gs[0]?.items[0];
    const list = gs
      .map(
        (g) => `<div class="stack" style="--gap:8px"><div class="group-head"><span class="h3">${D.unitHeadings[g.unit]}</span><span class="small muted">${g.items.length} bid${g.items.length > 1 ? "s" : ""}</span></div>${g.items
          .map(
            (c) => `<button class="bid-row pressable ${focus && focus.id === c.id ? "focus" : ""} ${state.detail.selected === c.id ? "is-selected" : ""}" data-action="focus-bid" data-id="${c.id}"><span class="avatar">${c.initials}</span><span class="grow"><span class="h3 block">${esc(c.name)}</span><span class="small muted">${c.rating ? `${c.rating.average.toFixed(1)} ★ · ${c.rating.count} review${c.rating.count > 1 ? "s" : ""}` : "Not yet rated"}</span></span><span class="right"><span class="h3 block">${inr(c.bid.amount)}</span><span class="tiny muted">${D.units[c.bid.unit]}</span></span></button>`,
          )
          .join("")}</div>`,
      )
      .join("");
    const drawer = focus
      ? `<aside class="card drawer stack" style="--gap:16px">
          <div class="row between" style="align-items:flex-start"><div class="row"><span class="avatar">${focus.initials}</span><div><div class="h2">${esc(focus.name)}</div><div class="mono muted">${focus.id}</div></div></div>${standingPill(focus)}</div>
          ${price(focus)}
          <div class="kv"><span class="row small" style="gap:8px;align-items:flex-start">${icon("cal", 16)}<span>${esc(focus.startText)}</span></span><span class="row small" style="gap:8px">${ratingLine(focus)}</span></div>
          ${criteria(focus)}
          ${focus.bid.notes ? `<p class="small notes" style="margin:0"><span class="muted">Notes:</span> ${esc(focus.bid.notes)}</p>` : ""}
          ${focus.comments.length ? `<div class="stack" style="--gap:8px"><span class="eyebrow">Latest feedback</span>${comments(focus)}</div>` : ""}
          ${selectButton(focus, true)}
        </aside>`
      : "";
    return `<div class="console-split bids-split"><div class="stack" style="--gap:18px">${list}</div>${drawer}</div>`;
  }

  function bidsTab() {
    const gs = groups();
    const all = D.contractors.filter((c) => c.bid);
    const counts = (u) => all.filter((c) => c.bid.unit === u).length;
    const filters = `<div class="row wrap unit-filter">${[
      ["all", `All units · ${all.length}`],
      ["per_sqft", `Per sq ft · ${counts("per_sqft")}`],
      ["per_day", `Per day · ${counts("per_day")}`],
      ["fixed_scope", `Fixed · ${counts("fixed_scope")}`],
    ]
      .map(([k, l]) => `<button class="chip ${state.detail.unit === k ? "on" : ""}" data-action="unit" data-val="${k}">${l}</button>`)
      .join("")}</div>`;
    const warn = `<p class="notice notice-info" style="margin:0">${icon("scale", 18)}<span><b>Prices are compared only within the same unit.</b> ₹/sq ft, ₹/day and fixed prices are never ranked against each other, and no total cost is estimated.</span></p>`;
    const invited = D.contractors.filter((c) => !c.bid);
    const invitedBox = invited.length
      ? `<div class="card flat tint row between wrap"><div class="row"><span class="avatar">${invited[0].initials}</span><div><div class="h3">${esc(invited[0].name)}</div><div class="small muted">Invited · ${esc(invited[0].invited)}</div></div></div><button class="btn btn-ghost" data-action="toast" data-msg="A new link replaces the old one. The app does not send it: you pass it on.">${icon("copy", 16)} New bid link</button></div>`
      : "";

    let body;
    if (state.variant === "console") body = consoleBids(gs);
    else if (state.variant === "editorial") body = gs.map((g) => `<section class="stack" style="--gap:10px"><div class="group-head"><span class="h2">${D.unitHeadings[g.unit]}</span><span class="small muted">${g.unit === "fixed_scope" ? "Comparable only if each covers the same scope: read the notes." : "Cheapest first is not the same as best."}</span></div>${bidRowsEditorial(g)}</section>`).join("");
    else body = gs.map((g) => `<section class="stack" style="--gap:12px"><div class="group-head"><span class="h2">${D.unitHeadings[g.unit]}</span><span class="small muted">${g.unit === "fixed_scope" ? "Comparable only if each covers the same scope: read the notes." : "Cheapest first is not the same as best: check dates and reviews too."}</span></div><div class="grid grid-2">${g.items.map(bidCard).join("")}</div></section>`).join("");

    return `<div class="stack" style="--gap:20px">${warn}${filters}${body}${invitedBox}</div>`;
  }

  function matchesTab() {
    return `<div class="stack" style="--gap:12px">
      <p class="notice notice-muted" style="margin:0">${icon("info", 18)}<span>Potential matches only: nobody is contacted automatically and no availability is guaranteed. Job size and budget are not checked.</span></p>
      ${D.contractors
        .map(
          (c) => `<div class="card flat match-row"><div class="row"><span class="avatar">${c.initials}</span><div><div class="h3">${esc(c.name)} <span class="mono muted">${c.id}</span></div><div class="small muted">Plumbing · serves Baner · availability reported 2 days ago</div></div></div>
          <div class="row wrap">${fitPill(c)}${c.bid ? `<span class="pill pill-muted plain">Bid received</span>` : `<span class="pill pill-muted plain">Invited</span>`}<span class="pill pill-muted plain">${icon("lock", 12)} Phone hidden</span></div></div>`,
        )
        .join("")}
      <p class="small muted" style="margin:0">Checked 9 sample contractors. Left out: 3 different trade, 1 outside the locality. Counts only, never names.</p>
    </div>`;
  }

  function jobTab() {
    const s = state.detail;
    if (!s.selected) {
      return `<div class="card empty stack" style="--gap:10px"><span class="ic-box">${icon("users")}</span><h2 class="h2">No contractor recorded yet</h2><p class="muted" style="margin:0">Choose a bid in the Bids tab. The choice is recorded in the job history, and only then can contact details be shared.</p><div><button class="btn btn-primary" data-action="tab" data-val="bids">Go to bids</button></div></div>`;
    }
    const c = byId(s.selected);
    const steps = [["Selected", true], ["Completed", s.completed], ["Reviewed", false]];
    return `<div class="job-grid">
      <div class="card stack" style="--gap:18px">
        <div class="row between"><span class="eyebrow">Job</span><span class="pill ${s.completed ? "pill-ok" : "pill-dark"}">${s.completed ? "Job completed" : "Contractor selected · in progress"}</span></div>
        <div class="row"><span class="avatar">${c.initials}</span><div><div class="h2">${esc(c.name)}</div><div class="small muted">${inr(c.bid.amount)} ${D.units[c.bid.unit]} · chosen bid</div></div></div>
        <ol class="progress">${steps.map(([l, on]) => `<li class="${on ? "on" : ""}"><i></i><span>${l}</span></li>`).join("")}</ol>
        <div class="row wrap">
          ${s.completed ? `<button class="btn btn-primary" data-action="review-link">${icon("star", 16)} Create review link</button>` : `<button class="btn btn-primary" data-action="complete">${icon("check", 16)} Mark completed</button><button class="btn btn-ghost" data-action="toast" data-msg="Cancelling needs a reason and is kept in the history.">Cancel job</button>`}
        </div>
        ${s.link ? `<div class="notice notice-warn stack" style="--gap:8px;display:block"><b>Copy this link now. It is shown only once.</b><div class="row"><input class="input mono" readonly value="https://contractor-desk.example/review/•••••••• (sample)"><button class="btn btn-ghost" data-action="toast" data-msg="Copied (demo)">${icon("copy", 16)}</button></div><span class="small">It works once, for this job only, for 14 days. Nothing has been sent to the developer.</span></div>` : ""}
      </div>
      <div class="card stack" style="--gap:14px">
        <span class="eyebrow">Contact details for the developer</span>
        <p class="small muted" style="margin:0">Shown only for the chosen contractor, only here. Each viewing is recorded in the job history. The app sends nothing.</p>
        ${s.contact ? `<div class="notice notice-warn" style="display:block"><b>${esc(c.name)}</b><br>Sample record: no phone number is shown in this demo. For a real record the number appears here.</div>` : `<button class="btn btn-ghost" data-action="contact">${icon("lock", 16)} Show contact details</button>`}
        <hr class="divider" style="margin:4px 0">
        <span class="eyebrow">History</span>
        <ol class="history">${s.history.map((h) => `<li><span>${esc(h[0])}</span><span class="tiny muted">${esc(h[1])}</span></li>`).join("")}</ol>
      </div>
    </div>`;
  }

  function detail() {
    const r = D.request;
    const s = state.detail;
    const live = D.contractors.filter((c) => c.bid).length;
    const tabs = `<div class="seg tabs" role="tablist">${[
      ["bids", `Bids · ${live}`],
      ["matches", `Matches · ${D.contractors.length}`],
      ["job", "Job"],
    ]
      .map(([k, l]) => `<button role="tab" aria-selected="${s.tab === k}" class="${s.tab === k ? "on" : ""}" data-action="tab" data-val="${k}">${l}</button>`)
      .join("")}</div>`;
    const header = `<div class="detail-head">
      <a href="#overview" class="back-link">${icon("back", 16)} Requests</a>
      <div class="row between wrap" style="align-items:flex-end;gap:16px">
        <div class="stack" style="--gap:10px">
          <div class="row wrap"><span class="mono muted">${r.id}</span><span class="pill ${s.selected ? "pill-dark" : "pill-info"}">${s.selected ? "Contractor selected" : "Bidding open · closes 25 Oct"}</span></div>
          <h1 class="h1">${r.trade} in ${r.area}</h1>
          <div class="row wrap small muted" style="gap:16px"><span class="row" style="gap:6px">${icon("cal", 16)} Needed from ${longDate(r.startDate)}</span><span class="row" style="gap:6px">${icon("clock", 16)} About ${r.durationDays} days</span><span class="row" style="gap:6px">${icon("file", 16)} ${esc(r.developer)}</span></div>
        </div>
        ${tabs}
      </div>
      <p class="quote desc">${esc(r.description)}</p>
    </div>`;
    const content = s.tab === "bids" ? bidsTab() : s.tab === "matches" ? matchesTab() : jobTab();
    return `<div class="page ${state.variant === "console" ? "wide" : ""}">${header}<div class="tab-body">${content}</div></div>`;
  }

  // ------------------------------------------------------------------ rendering
  const RENDER = { home, request, register, bid, overview, detail, review };

  function render() {
    const view = document.getElementById("view");
    view.innerHTML = `<div class="screen" data-screen="${state.screen}">${RENDER[state.screen]()}</div>`;
    document.querySelectorAll("[data-dock]").forEach((a) => a.classList.toggle("on", a.dataset.dock === state.screen));
    document.querySelectorAll("[data-side]").forEach((a) => a.classList.toggle("active", a.dataset.side === state.screen));
    const nav = document.querySelector(".nav-links");
    if (nav) nav.innerHTML = navLinks();
    document.body.dataset.screen = state.screen;
  }

  function go(screen, keepScroll) {
    if (!RENDER[screen]) screen = "home";
    state.screen = screen;
    render();
    if (!keepScroll) window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ overlays
  let toastTimer;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function sheet(html, onConfirm) {
    const back = document.createElement("div");
    back.className = "backdrop";
    const box = document.createElement("div");
    box.className = "sheet";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = html;
    document.body.append(back, box);
    requestAnimationFrame(() => { back.classList.add("open"); box.classList.add("open"); });
    const close = () => {
      back.classList.remove("open");
      box.classList.remove("open");
      setTimeout(() => { back.remove(); box.remove(); }, 260);
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("click", close);
    box.querySelector("[data-sheet=cancel]").addEventListener("click", close);
    box.querySelector("[data-sheet=ok]").addEventListener("click", () => { close(); onConfirm(); });
    box.querySelector("[data-sheet=ok]").focus();
  }

  // ------------------------------------------------------------------ validation
  const PHONE = /^(\+?91)?[6-9]\d{9}$/;
  function validateRequest() {
    const d = state.req.data;
    const e = {};
    if (state.req.step === 1 && d.description.trim().length < 20) e.description = "Please describe the situation in at least 20 characters.";
    if (state.req.step === 2) {
      if (!d.trade) e.trade = "Please choose the trade you need.";
      if (!d.area) e.area = "Please choose the site locality.";
      if (!d.start) e.start = "Please choose a start date.";
      if (!/^\d+$/.test(d.days) || Number(d.days) < 1 || Number(d.days) > 365) e.days = "Enter a whole number of days from 1 to 365.";
    }
    if (state.req.step === 3) {
      if (!d.name.trim()) e.name = "Please enter your name or company.";
      if (!PHONE.test(d.phone.replace(/[\s-]/g, ""))) e.phone = "Enter a 10-digit Indian mobile number starting with 6–9.";
      if (!d.consent) e.consent = "Consent is required to submit a request.";
    }
    return e;
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const bad = document.querySelector('[aria-invalid="true"]') || document.querySelector(".error");
      if (bad) bad.focus?.({ preventScroll: false });
      bad?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    });
  }

  // ------------------------------------------------------------------ actions
  const ACTIONS = {
    lang: (el) => { state[el.dataset.screen].lang = el.dataset.lang; state[el.dataset.screen].errors = {}; render(); },
    "req-example": () => { state.req.data.description = D.request.description; render(); },
    "req-pick": (el) => { state.req.data[el.dataset.key] = el.dataset.val; delete state.req.errors[el.dataset.key]; render(); },
    "req-back": () => { state.req.step -= 1; state.req.errors = {}; render(); },
    "req-next": () => {
      const e = validateRequest();
      state.req.errors = e;
      if (Object.keys(e).length) { render(); focusFirstError(); return; }
      if (state.req.step < 3) state.req.step += 1;
      else { state.req.done = true; toast("Saved as a sample request"); }
      render();
    },
    "req-reset": () => { state.req.step = 1; state.req.done = false; state.req.errors = {}; render(); },
    "reg-pick": (el) => { state.reg.data[el.dataset.key] = el.dataset.val; delete state.reg.errors[el.dataset.key]; render(); },
    "reg-submit": () => {
      const d = state.reg.data;
      const t = T("reg").register;
      const e = {};
      if (!d.trade) e.trade = t.errTrade;
      if (!d.area) e.area = t.errArea;
      if (!PHONE.test(d.phone.replace(/[\s-]/g, ""))) e.phone = t.errPhone;
      if (!d.consent) e.consent = t.errConsent;
      state.reg.errors = e;
      if (Object.keys(e).length) { render(); focusFirstError(); return; }
      state.reg.done = true;
      render();
    },
    "reg-reset": () => { state.reg.done = false; render(); },
    "bid-as": (el) => { state.bid.as = el.dataset.val; state.bid.done = false; render(); },
    "bid-unit": (el) => { state.bid.data.unit = el.dataset.val; delete state.bid.errors.unit; render(); },
    "bid-submit": () => {
      const t = T("bid").bid;
      const d = state.bid.data;
      const e = {};
      const n = Number(String(d.amount).replace(/[\s,]/g, ""));
      if (!String(d.amount).trim()) e.amount = t.errAmount;
      else if (!Number.isFinite(n) || n <= 0) e.amount = t.errZero;
      if (!d.unit) e.unit = t.errUnit;
      state.bid.errors = e;
      if (Object.keys(e).length) { render(); focusFirstError(); return; }
      d.amount = String(n);
      state.bid.done = true;
      render();
    },
    "bid-reset": () => { state.bid.done = false; state.bid.data = { amount: "", unit: "", notes: "" }; render(); },
    "rev-star": (el) => { state.rev.data[el.dataset.key] = Number(el.dataset.val); delete state.rev.errors[el.dataset.key]; render(); },
    "rev-submit": () => {
      if (!state.rev.data.overall) { state.rev.errors = { overall: T("rev").review.errOverall }; render(); return; }
      state.rev.done = true;
      render();
    },
    "rev-reset": () => { state.rev.done = false; state.rev.data = { overall: 0, workmanship: 0, punctuality: 0, communication: 0, comment: "" }; render(); },
    "open-request": (el) => {
      if (el.dataset.id === "R-SAMPLE01") go("detail");
      else toast("Only R-SAMPLE01 is filled in for this demo");
    },
    tab: (el) => { state.detail.tab = el.dataset.val; render(); },
    unit: (el) => { state.detail.unit = el.dataset.val; render(); },
    "focus-bid": (el) => { state.detail.focus = el.dataset.id; render(); },
    "confirm-date": (el) => toast(`Record ${firstName(byId(el.dataset.id))}’s confirmed start date on the Matches tab first. A bid never confirms a date.`),
    "ask-select": (el) => {
      const c = byId(el.dataset.id);
      sheet(
        `<span class="eyebrow">Record the developer’s choice</span>
        <h2 class="h1" style="margin:8px 0 6px">Select ${esc(c.name)}?</h2>
        <p class="muted" style="margin:0 0 14px">${inr(c.bid.amount)} ${D.units[c.bid.unit]} · ${esc(c.startText)}</p>
        <ul class="ticks small"><li>${icon("file", 16)} Recorded in the job history with today’s date.</li><li>${icon("lock", 16)} Contact details become available only after this, for this contractor only.</li><li>${icon("chat", 16)} Other bidders are not messaged by the app.</li></ul>
        <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" data-sheet="cancel">Cancel</button><button class="btn btn-primary" data-sheet="ok">Record selection</button></div>`,
        () => {
          state.detail.selected = c.id;
          state.detail.tab = "job";
          state.detail.history = [["Contractor selected from bid", "Today · founder (admin login)"]];
          render();
          toast(`Recorded. ${c.name} is the contractor for this job.`);
        },
      );
    },
    contact: () => {
      state.detail.contact = true;
      render();
    },
    complete: () => {
      state.detail.completed = true;
      state.detail.history.push(["Marked completed", "Today · founder (admin login)"]);
      render();
    },
    "review-link": () => {
      state.detail.link = true;
      state.detail.history.push(["Review link created (valid 14 days)", "Today · founder (admin login)"]);
      render();
    },
    toast: (el) => toast(el.dataset.msg),
  };

  function bind(path, value) {
    const [scope, key] = path.split(".");
    state[scope].data[key] = value;
    if (state[scope].errors[key]) {
      delete state[scope].errors[key];
    }
  }

  function wire() {
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el || el.tagName === "FORM") return;
      const fn = ACTIONS[el.dataset.action];
      if (fn) { e.preventDefault(); fn(el); }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-action]")) { e.preventDefault(); ACTIONS[e.target.dataset.action](e.target); }
    });
    document.addEventListener("submit", (e) => {
      const form = e.target.closest("form[data-action=start-request]");
      if (!form) return;
      e.preventDefault();
      const f = new FormData(form);
      Object.assign(state.req.data, { trade: f.get("trade"), area: f.get("area"), start: f.get("start") });
      state.req.step = 1;
      state.req.done = false;
      location.hash = "#request";
    });
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (!el.dataset || !el.dataset.bind) return;
      bind(el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
    });
    document.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.bind && el.tagName === "SELECT") { bind(el.dataset.bind, el.value); if (state.screen === "request") render(); }
    });
    // Press feedback on pointer-down (scale to 0.97), released on up or leave.
    const pressSel = ".btn, .chip, .star, .pressable, .seg button";
    document.addEventListener("pointerdown", (e) => { const el = e.target.closest(pressSel); if (el && !el.disabled) el.classList.add("is-pressed"); });
    const release = () => document.querySelectorAll(".is-pressed").forEach((el) => el.classList.remove("is-pressed"));
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("pointerleave", release, true);
    window.addEventListener("hashchange", () => go(location.hash.slice(1)));
  }

  window.CD = {
    mount(opts) {
      state.variant = opts.variant;
      document.getElementById("app").innerHTML = shell();
      wire();
      go(location.hash.slice(1) || "home", true);
    },
  };
})();
