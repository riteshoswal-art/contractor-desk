/* Concept B, full flow: a clickable picture of the builder-to-contractor flow
 * as it works today (website + Telegram), drawn in the Concept B style.
 * Nothing here talks to a server. Names and numbers match the current data set.
 */
(function () {
  "use strict";

  const STEPS = [
    { id: "signup", label: "Builder signs up" },
    { id: "ticket", label: "Connect & raise ticket" },
    { id: "progress", label: "Ticket progress" },
    { id: "contractor", label: "Contractor on Telegram" },
    { id: "builder", label: "Builder chooses" },
    { id: "operator", label: "Operator: Telegram" },
  ];

  const BIDS = [
    { name: "Sunil More", price: "₹1,200 per day", rating: "4.0 ★ (2 reviews)" },
    { name: "Ramesh Patil", price: "₹1,300 per day", rating: "4.7 ★ (3 reviews)" },
  ];

  const state = {
    screen: "signup",
    c: { stage: "asked", log: [], amount: "" }, // contractor chat
    b: { stage: "bids", log: [] }, // builder chat
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const logo = () =>
    `<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="currentColor"/><path d="M7 19h14M9 19v-6h4v6M15 19V9h4v10" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const send = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  const next = (id, text) => `<a class="next-link" href="#${id}">${text} →</a>`;

  // ------------------------------------------------------------ shell
  function shell() {
    const area = { signup: "builder", ticket: "builder", progress: "builder", contractor: "builder", builder: "builder", operator: "operator" }[state.screen];
    return `<header class="topbar"><div class="topnav glass">
        <a class="brand" href="#signup">${logo()}<span>Contractor Desk</span></a>
        <nav class="nav-links" aria-label="Main">
          <a class="nav-link" href="../concept-b-editorial/index.html#home">Home</a>
          <a class="nav-link${area === "builder" ? " active" : ""}" href="#signup">For builders</a>
          <a class="nav-link" href="../concept-b-editorial/index.html#register">For contractors</a>
          <a class="nav-link${area === "operator" ? " active" : ""}" href="#operator">Operator</a>
        </nav>
        <div class="row nav-end"><span class="avatar" title="Signed in">B</span></div>
      </div></header>
      <nav class="flow-tabs" aria-label="Flow steps"><div class="flow-tabs-inner">${STEPS.map((s, i) => `<a href="#${s.id}" class="${state.screen === s.id ? "on" : ""}"><span class="n">${i + 1}</span>${s.label}</a>`).join("")}</div></nav>
      <main id="view"></main>`;
  }

  const browser = (url, body) => `<div class="web"><div class="web-bar"><i></i><i></i><i></i><span>${url}</span></div><div class="web-body">${body}</div></div>`;
  const split = (copy, visual) => `<div class="flow-page"><div class="flow-split"><div class="flow-copy">${copy}</div><div>${visual}</div></div></div>`;
  const field = (label, control, opt) => `<label class="field"><span class="label">${label}${opt ? ` <span class="opt">(optional)</span>` : ""}</span>${control}</label>`;

  // ------------------------------------------------------------ 1. sign-up
  function signup() {
    const copy = `<span class="kicker-line">For builders</span>
      <h1 class="h-display h-display-sm">Find a contractor for the work you need.</h1>
      <p class="lead">Raise a ticket. Available contractors in that area get it on Telegram and send one quotation each. You compare them on Telegram, choose one, and you both get each other's number.</p>
      ${next("ticket", "After registering")}`;
    const body = `<div><span class="eyebrow">For builders</span><h2 class="h1" style="margin:6px 0 0">Register as a builder</h2><p class="muted small" style="margin:6px 0 0">Takes under a minute. No password needed on this device.</p></div>
      ${field("Your name", `<input class="input" value="Ritesh Oswal">`)}
      ${field("Company", `<input class="input" value="Oswal Developers">`, true)}
      ${field("Mobile number", `<input class="input" inputmode="tel" value="98000 00001">`)}
      <label class="check"><input type="checkbox" checked><span class="small">I agree that Contractor Desk may store my name, company and mobile number, and share my name and number with the contractor I choose for a job.</span></label>
      <a class="btn btn-primary btn-lg btn-block" href="#ticket">Register</a>`;
    return split(copy, browser("contractordesk.in/builder", body));
  }

  // ------------------------------------------------------------ 2. connect + ticket
  function ticket() {
    const copy = `<span class="kicker-line">Two steps</span>
      <h1 class="h-display h-display-sm">Connect Telegram first, then raise the ticket.</h1>
      <p class="lead">Step 1 stays highlighted until Telegram is connected, because that is where the quotations arrive. Raising the ticket sends it at once to every available contractor for that trade and area.</p>
      <ul class="ticks"><li>The ticket is checked with the same rules as the public request form.</li><li>Contact numbers typed in the description are removed before contractors see it.</li></ul>
      ${next("progress", "After raising the ticket")}`;
    const body = `<div class="signed-in"><span class="who"><span class="avatar">R</span><span>Signed in as <b>Ritesh Oswal</b> (Oswal Developers)</span></span><a class="small" href="#signup">Not you? Sign out</a></div>
      <section class="step-block done"><div class="step-head"><h3>Connect Telegram</h3><span class="pill pill-ok">Connected</span></div>
        <p class="small muted" style="margin:0">Quotations for your tickets arrive in your Telegram, and you choose one there with a tap.</p></section>
      <section class="step-block current"><div class="step-head"><h3>Raise a ticket</h3><span class="step-tag">Step 2</span></div>
        <div class="form-grid">
          ${field("Work needed", `<select class="select"><option>Plumbing</option></select>`)}
          ${field("Site location (Pune locality)", `<input class="input" value="Baner">`)}
        </div>
        ${field("Work description", `<textarea class="textarea" rows="3">Plumbing work for 7 days: concealed piping and bathroom fittings in 8 flats on floor 2.</textarea>`)}
        <div class="form-grid">
          ${field("Start date", `<input class="input" type="date" value="2026-10-25">`)}
          ${field("How many days", `<input class="input" inputmode="numeric" value="7">`)}
        </div>
        ${field("Notes", `<input class="input" value="">`, true)}
        <label class="check"><input type="checkbox" checked><span class="small">I agree that the details I enter will be stored privately and used to look for contractors for this requirement, and that I may be contacted about it.</span></label>
        <a class="btn btn-primary btn-lg" href="#progress">Raise ticket</a>
      </section>`;
    return split(copy, browser("contractordesk.in/builder", body));
  }

  // ------------------------------------------------------------ 3. progress
  function progress() {
    const copy = `<span class="kicker-line">Your tickets</span>
      <h1 class="h-display h-display-sm">Watch it move, without refreshing.</h1>
      <p class="lead">The page updates by itself every few seconds. The quotations go to Telegram as soon as every contractor has answered, or 10 minutes after they were asked.</p>
      ${next("contractor", "What the contractor sees")}`;
    const body = `<div class="notice notice-ok small">Ticket R-Z9VK7RQ7 raised. Sent to 3 available contractors on Telegram.</div>
      <div class="row between"><h2 class="h2" style="margin:0">Your tickets</h2><span class="live">Live</span></div>
      <article class="ticket">
        <div class="ticket-top"><b>Plumbing in Baner</b><span class="mono">R-Z9VK7RQ7 · from 25 Oct 2026 · 7 days</span></div>
        <div class="track"><div class="on">Sent</div><div class="on">Quotes coming in</div><div>Bids on Telegram</div><div>Matched</div></div>
        <div class="counts"><div><b>3</b><span>Asked</span></div><div><b>2</b><span>Quoted</span></div><div><b>1</b><span>Declined</span></div></div>
        <p class="small muted" style="margin:0">The bids go to your Telegram when everyone has answered, or 10 minutes after asking.</p>
      </article>
      <article class="ticket">
        <div class="ticket-top"><b>Plumbing in Baner</b><span class="mono">R-4Y2B9Q8G · from 24 Oct 2026 · 7 days</span></div>
        <div class="track"><div class="on">Sent</div><div class="on">Quotes coming in</div><div class="on">Bids on Telegram</div><div class="on">Matched</div></div>
        <p class="small" style="margin:0"><b>Matched with Ramesh Patil.</b> You both have each other's number on Telegram.</p>
      </article>`;
    return split(copy, browser("contractordesk.in/builder", body));
  }

  // ------------------------------------------------------------ Telegram
  function phone(who, chat, input) {
    return `<div class="tg-phone"><div class="tg-screen">
      <div class="tg-status"><span>9:41</span><span>●●● ▮</span></div>
      <div class="tg-head"><span class="bot">CD</span><div><b>Contractor Desk</b><span>bot</span></div><span class="who">${who}</span></div>
      <div class="tg-chat" id="chat-${who.toLowerCase()}">${chat}</div>
      ${input}
    </div></div>`;
  }
  const bot = (t) => `<div class="bubble bot">${t}</div>`;
  const me = (t) => `<div class="bubble me">${esc(t)}</div>`;
  const kb = (rows, active) =>
    `<div class="kb">${rows.map((r) => `<div class="kb-row">${r.map(([label, act]) => `<button type="button" data-act="${act}" ${active ? "" : "disabled"}>${label}</button>`).join("")}</div>`).join("")}</div>`;

  function contractor() {
    const s = state.c;
    const job = bot(`<b>New job</b>\nHi Ramesh Patil, a builder needs this work:\n\nPlumbing in Baner, Pune\nNeeded from 25 Oct 2026 · about 7 days\nWork: Plumbing work for 7 days: concealed piping and bathroom fittings in 8 flats on floor 2.\n\nIs it possible for you to do this work?`);
    let chat = job + kb([[["Yes, I can do it", "yes"], ["No", "no"]]], s.stage === "asked") + s.log.join("");
    if (s.stage === "unit") chat += kb([[["Per day", "u:per day"], ["Fixed price for the job", "u:fixed price for the job"]], [["Per square foot", "u:per square foot"], ["Per square metre", "u:per square metre"]], [["Per unit", "u:per unit"]]], true);
    if (s.stage === "confirm") chat += kb([[["Send bid", "send"], ["Change", "change"]]], true);
    const typing = s.stage === "amount";
    const input = `<form class="tg-input" data-form="amount"><input name="amount" placeholder="${typing ? "Type the amount, e.g. 1300" : "Message"}" ${typing ? "" : "disabled"} inputmode="numeric" autocomplete="off"><button ${typing ? "" : "disabled"} aria-label="Send">${send}</button></form>`;
    const copy = `<span class="kicker-line">The contractor</span>
      <h1 class="h-display h-display-sm">Answer with taps. Confirm before sending.</h1>
      <p class="lead">Only available contractors for that trade and area are asked. Yes asks for the price, then the unit. Nothing is saved until they tap <b>Send bid</b>, so a wrong tap can be fixed with <b>Change</b>.</p>
      <ul class="ticks"><li>One bid per contractor per job.</li><li>No phone numbers are shared at this stage.</li><li>A price too large for the chosen unit is caught before confirming.</li></ul>
      <div class="row wrap"><button class="btn btn-ghost" data-act="c-reset">Start this chat again</button></div>
      ${next("builder", "What the builder sees")}`;
    return `<div class="flow-page"><div class="flow-split"><div class="flow-copy">${copy}</div><div><div class="tg-stage">${phone("Contractor", chat, input)}</div><p class="tg-hint">Try it: tap the buttons and type a price.</p></div></div></div>`;
  }

  function builderChat() {
    const s = state.b;
    const list = BIDS.map((b, i) => `${i + 1}. ${b.name}: ${b.price} · ${b.rating}`).join("\n");
    const summary = bot(`<b>Bids for your ticket</b>\nTicket R-Z9VK7RQ7: Plumbing in Baner\nNeeded from 25 Oct 2026 · about 7 days\n\nPrices are compared only within the same unit.\n\nPer day:\n${list}\n\nAsked: 3 · Quoted: 2 · Declined: 1\nTap a button to choose. You'll then get the contractor's number, and they'll get yours.`);
    let chat = summary + kb(BIDS.map((b, i) => [[`Choose ${i + 1}. ${b.name}`, `pick:${i}`]]), s.stage === "bids") + s.log.join("");
    const copy = `<span class="kicker-line">The builder</span>
      <h1 class="h-display h-display-sm">One message with every quote. Choose with a tap.</h1>
      <p class="lead">Quotes are grouped by unit and never added into a total. Ratings come from past jobs. After <b>Choose</b>, both sides get each other's name and number; everyone else hears they were not chosen this time.</p>
      <div class="row wrap"><button class="btn btn-ghost" data-act="b-reset">Start this chat again</button></div>
      ${next("operator", "What the operator sees")}`;
    const input = `<div class="tg-input"><input placeholder="Message" disabled><button disabled aria-label="Send">${send}</button></div>`;
    return `<div class="flow-page"><div class="flow-split"><div class="flow-copy">${copy}</div><div><div class="tg-stage">${phone("Builder", chat, input)}</div><p class="tg-hint">Try it: tap Choose.</p></div></div></div>`;
  }

  // ------------------------------------------------------------ operator
  function operator() {
    const rows = [
      ["Ramesh Patil", "Plumbing, Baner", "Available now", "Connected (Ramesh)"],
      ["Sunil More", "Plumbing, Baner", "Available now", "Connected (Sunil)"],
      ["Imran Shaikh", "Plumbing, Baner", "Available now", ""],
      ["Vikas Jadhav", "Plumbing, Baner", "Not available", ""],
      ["Deepak Kale", "Plumbing, Baner", "From 21 Nov 2026", ""],
    ];
    const list = rows.map(([n, t, a, c]) => `<div class="op-row"><div><b>${n}</b><div class="small muted">${t} · ${a}</div></div>
        <span class="pill ${c ? "pill-ok" : "pill-muted"}">${c || "Not connected"}</span>
        <button class="btn btn-ghost" style="min-height:36px;padding:6px 14px">${c ? "New link" : "Create link"}</button></div>`).join("");
    const copy = `<span class="kicker-line">Operator</span>
      <h1 class="h-display h-display-sm">Know the bot is working before anyone asks.</h1>
      <p class="lead">One page to check the Telegram connection and hand out one-time connect links to contractors.</p>
      <ul class="ticks"><li>Green when Telegram answered recently; amber with the reason when it has not.</li><li>Each connect link works once, for 30 minutes.</li><li>Every tap is written to the server log as a short label, never with names or numbers.</li></ul>`;
    const body = `<div><span class="eyebrow">Operator</span><h2 class="h1" style="margin:6px 0 0">Telegram</h2></div>
      <div class="health"><b>Bot running.</b> Last contact with Telegram: 4 seconds ago.</div>
      <div class="row between"><h3 class="h3" style="margin:0">Contractors</h3><button class="btn btn-quiet">Refresh</button></div>
      <div class="op-list">${list}</div>
      <div class="link-box"><span class="pill pill-info plain">Imran Shaikh</span><span>https://t.me/ContractorDesk_bot?start=…</span><button class="btn btn-ghost" style="min-height:32px;padding:4px 12px;margin-left:auto">Copy</button></div>`;
    return split(copy, browser("contractordesk.in/admin/telegram", body));
  }

  // ------------------------------------------------------------ actions
  function onContractor(act, text) {
    const s = state.c;
    if (act === "yes" && s.stage === "asked") {
      s.log.push(`<div class="toast-tg">Great</div>`, bot("Great. What is your quotation for this job?\nPlease type the amount in rupees (numbers only, for example 1500). You can send only one bid."));
      s.stage = "amount";
    } else if (act === "no" && s.stage === "asked") {
      s.log.push(`<div class="toast-tg">Noted</div>`, bot("Thanks for letting us know. We'll keep you in mind for future jobs."));
      s.stage = "done";
    } else if (act === "amount" && s.stage === "amount") {
      const n = Number(String(text).replace(/[₹,\s]|rs\.?/gi, ""));
      s.log.push(me(text));
      if (!n || n <= 0) s.log.push(bot("Please enter your price as a number, for example 1250 or 1250.50.\nPlease type the amount in rupees again."));
      else {
        s.amount = n.toLocaleString("en-IN");
        s.log.push(bot(`Got it: ₹${s.amount}. How is this price charged?`));
        s.stage = "unit";
      }
    } else if (act.startsWith("u:") && s.stage === "unit") {
      s.unit = act.slice(2);
      s.log.push(bot(`Your bid: ₹${s.amount} ${s.unit}.\nSend this bid? You can send only one bid for this job, and it cannot be changed after sending.`));
      s.stage = "confirm";
    } else if (act === "change" && s.stage === "confirm") {
      s.log.push(bot("No problem. Please type your quotation amount again in rupees (numbers only, for example 1500)."));
      s.stage = "amount";
    } else if (act === "send" && s.stage === "confirm") {
      s.log.push(`<div class="toast-tg">Bid saved</div>`, bot(`Thank you. Your bid of ₹${s.amount} ${s.unit} is recorded.\nThe builder will see all bids and choose. We'll tell you the result here.`));
      s.stage = "done";
    } else return;
    render();
  }

  function onBuilder(act) {
    const s = state.b;
    if (!act.startsWith("pick:") || s.stage !== "bids") return;
    const b = BIDS[Number(act.slice(5))];
    s.log.push(
      `<div class="toast-tg">Matched</div>`,
      bot(`<b>Matched</b> for ticket R-Z9VK7RQ7 (Plumbing in Baner).\nContractor: ${b.name}\nQuote: ${b.price}\nPhone: +91 90000 1000${b.name.startsWith("Sunil") ? 2 : 1}\nWe have also sent them your name and number.`),
      `<div class="toast-tg">${b.name} receives</div>`,
      bot(`Good news: you were chosen for Plumbing in Baner (ticket R-Z9VK7RQ7).\nBuilder: Ritesh Oswal (Oswal Developers)\nPhone: +91 98000 00001\nPlease call them to confirm the start.`),
    );
    s.stage = "done";
    render();
  }

  // ------------------------------------------------------------ render
  const RENDER = { signup, ticket, progress, contractor, builder: builderChat, operator };

  function render() {
    document.getElementById("app").innerHTML = shell();
    document.getElementById("view").innerHTML = RENDER[state.screen]();
    document.querySelectorAll(".tg-chat").forEach((c) => (c.scrollTop = c.scrollHeight));
    const input = document.querySelector('[data-form="amount"] input:not([disabled])');
    if (input) input.focus({ preventScroll: true });
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "c-reset") {
      state.c = { stage: "asked", log: [], amount: "" };
      render();
    } else if (act === "b-reset") {
      state.b = { stage: "bids", log: [] };
      render();
    } else if (state.screen === "contractor") onContractor(act);
    else if (state.screen === "builder") onBuilder(act);
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest('[data-form="amount"]');
    if (!f) return;
    e.preventDefault();
    const v = f.amount.value.trim();
    if (v) onContractor("amount", v);
  });

  function route() {
    const id = location.hash.slice(1);
    state.screen = RENDER[id] ? id : "signup";
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();
})();
