// Server-only: the conversational Telegram flow for the LIVE DEMO.
//
//   1. askContractors: for a ticket, every AVAILABLE matched contractor who has
//      connected Telegram gets the job with "Yes, I can do it" / "No" buttons.
//      Behind the scenes each one has an ordinary private bid invitation.
//   2. Yes -> "type your quotation amount" -> unit buttons -> the bid is saved
//      by submitBid, so every normal rule applies (one bid per contractor,
//      provisional start dates, closed bidding, amount limits per unit).
//   3. sendDueSummaries: when everyone asked has answered, or 10 minutes have
//      passed, the builder gets ONE message with the bids grouped by unit and a
//      "Choose" button for each bid that can be selected.
//   4. The builder taps Choose -> selectBidder records the match (job history +
//      bid history) -> the builder gets the contractor's name and number, the
//      contractor gets the builder's, and other bidders are told politely.
//
// Every incoming tap is checked against the chat it belongs to, so nobody can
// answer for someone else. Messages go only to the chats people connected.
import { randomBytes } from "node:crypto";
import { RATE_UNITS, formatBidPrice, groupByUnit, standing, validateBid } from "./bid";
import { createBidInvite, loadBidRows, loadBids, openBidding, selectBidder, submitBid } from "./bid-store";
import { foldRound } from "./bid";
import { latestByPair, pairKey } from "./confirmation";
import { findRequestAndCandidate, loadConfirmations } from "./confirmation-store";
import { SheetSetupError, type ContractorSheet } from "./contractor-store";
import { demoState, updateDemo, type BidSummary, type Conversation } from "./demo-store";
import { shareContact } from "./job-store";
import { formatDate, matchContractors, type RequestRecord } from "./match";
import { loadContractors, loadRequests } from "./records";
import type { RecordType } from "./registration";
import { redactContacts } from "./request";
import { ratingText } from "./review";
import { loadSummaries } from "./review-store";
import { answerButton, removeButtons, sendToChat, sendWithButtons, type Button, type IncomingMessage, type IncomingTap, type SendError } from "./telegram";

export const SUMMARY_AFTER_MS = 10 * 60_000;

export type FlowEnv = {
  recordType: RecordType;
  today: string;
  now?: Date;
  token: string;
  founderChatId?: string; // TELEGRAM_FOUNDER_CHAT_ID: used only if the builder has not connected Telegram
  fetchImpl?: Parameters<typeof sendToChat>[3];
  newId: (prefix: string) => string;
};

const shortId = () => randomBytes(5).toString("hex"); // 10 characters, fits in button data
const nowOf = (env: { now?: Date }) => env.now ?? new Date();

async function orEmpty<T>(work: Promise<T[]>): Promise<T[]> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof SheetSetupError) return [];
    throw error;
  }
}

async function requestById(sheet: ContractorSheet, requestId: string, recordType: RecordType): Promise<RequestRecord | null> {
  return (await loadRequests(sheet)).find((r) => r.id === requestId && r.recordType === recordType) ?? null;
}

const jobLines = (r: RequestRecord) => [
  `${r.trade} in ${r.area}, Pune`,
  `Needed from ${r.startDate ? formatDate(r.startDate) : "a date to be agreed"}${r.durationDays ? ` · about ${r.durationDays} days` : ""}`,
];

// ---------------------------------------------------------------------------
// 1. Ask the available, connected contractors
// ---------------------------------------------------------------------------

export type AskItem = { contractorId: string; name: string; status: "asked" | "not_connected" | "already_asked" | "skipped" | "failed"; detail?: string };
export type AskResult = { ok: true; items: AskItem[] } | { ok: false; error: "not_found" | "real_blocked" | "no_token" };

export async function askContractors(sheet: ContractorSheet, requestId: string, env: FlowEnv): Promise<AskResult> {
  if (env.recordType !== "TEST") return { ok: false, error: "real_blocked" };
  if (!env.token) return { ok: false, error: "no_token" };
  const request = await requestById(sheet, requestId, env.recordType);
  if (!request) return { ok: false, error: "not_found" };

  const round = foldRound(await loadBidRows(sheet), env.recordType, requestId);
  if (round.state === "not_opened") await openBidding(sheet, { requestId }, env, () => env.newId("E"));

  const candidates = matchContractors(request, await loadContractors(sheet), { envType: env.recordType, now: env.now, max: Number.MAX_SAFE_INTEGER }).candidates;
  const latest = latestByPair(await orEmpty(loadConfirmations(sheet, env.recordType)));
  const items: AskItem[] = [];
  const now = nowOf(env);
  const note = (contractorId: string, status: "sent" | "failed" | "not_connected" | "skipped", detail?: string) =>
    updateDemo((s) => {
      s.notices[`${requestId}|${contractorId}`] = { status, detail, at: now.toISOString() };
    });

  for (const c of candidates) {
    if (latest.get(pairKey(requestId, c.contractorId))?.status === "unavailable") continue; // said unavailable: not asked
    const existing = Object.values(demoState().conversations).find((x) => x.requestId === requestId && x.contractorId === c.contractorId);
    if (existing) {
      items.push({ contractorId: c.contractorId, name: c.name, status: "already_asked" });
      continue;
    }
    const chat = demoState().links[c.contractorId];
    if (!chat) {
      items.push({ contractorId: c.contractorId, name: c.name, status: "not_connected" });
      note(c.contractorId, "not_connected");
      continue;
    }
    const invite = await createBidInvite(sheet, { requestId, contractorId: c.contractorId }, env, () => env.newId("I"));
    if (!invite.ok) {
      items.push({ contractorId: c.contractorId, name: c.name, status: "skipped", detail: invite.error });
      note(c.contractorId, "skipped", invite.error);
      continue;
    }
    const id = shortId();
    const description = redactContacts(request.description).slice(0, 500);
    const lines = [
      "Contractor Desk · New job",
      `Hi ${c.name || "there"}, a builder needs this work:`,
      "",
      ...jobLines(request),
      `Work: ${description}`,
      ...(request.notes ? [`Notes: ${redactContacts(request.notes).slice(0, 300)}`] : []),
      ...(c.startFit.label !== null ? ["Your stated start is after the requested date: if you bid, it counts only once your start date is confirmed."] : []),
      "",
      "Is it possible for you to do this work?",
    ];
    const sent = await sendWithButtons(env.token, chat.chatId, lines.join("\n"), [[{ text: "Yes, I can do it", data: `y:${id}` }, { text: "No", data: `n:${id}` }]], env.fetchImpl);
    if (!sent.ok) {
      items.push({ contractorId: c.contractorId, name: c.name, status: "failed", detail: sent.error });
      note(c.contractorId, "failed", sent.error);
      continue;
    }
    const conv: Conversation = {
      id, requestId, contractorId: c.contractorId, chatId: chat.chatId, bidToken: invite.token, stage: "asked",
      amount: "", bidId: "", askedAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    updateDemo((s) => {
      s.conversations[id] = conv;
    });
    note(c.contractorId, "sent");
    items.push({ contractorId: c.contractorId, name: c.name, status: "asked" });
  }
  return { ok: true, items };
}

// ---------------------------------------------------------------------------
// 2. Contractor answers
// ---------------------------------------------------------------------------

const setStage = (id: string, change: Partial<Conversation>, now: Date) =>
  updateDemo((s) => {
    const c = s.conversations[id];
    if (c) Object.assign(c, change, { updatedAt: now.toISOString() });
  });

function unitButtons(id: string): Button[][] {
  const b = RATE_UNITS.map((u, i) => ({ text: i === 4 ? "Fixed price for the job" : `Per ${u.label.replace(/^per /, "")}`, data: `u:${id}:${i}` }));
  return [[b[2], b[4]], [b[0], b[1]], [b[3]]]; // per day and fixed price first: the usual units for a job
}

// A typed message: the amount, if this chat has a conversation waiting for one.
// Returns a short label for the log (never the text itself), or null if ignored.
export async function handleMessage(sheet: ContractorSheet, m: IncomingMessage, env: FlowEnv): Promise<string | null> {
  if (m.chatType !== "private" || m.text.startsWith("/")) return null;
  const conv = Object.values(demoState().conversations)
    .filter((c) => c.chatId === m.chatId && c.stage === "awaiting_amount")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!conv) return null;
  const check = validateBid({ amount: m.text.replace(/₹|\brs\.?|\binr\b|\brupees\b|,/gi, "").trim(), unit: "fixed_scope" });
  if (!check.ok && check.errors.amount) {
    await sendToChat(env.token, m.chatId, `${check.errors.amount}\nPlease type the amount in rupees again (numbers only, for example 1500).`, env.fetchImpl);
    return "amount:invalid";
  }
  const amount = check.ok ? check.value.amount : "";
  setStage(conv.id, { stage: "awaiting_unit", amount }, nowOf(env));
  await sendWithButtons(env.token, m.chatId, `Got it: ₹${Number(amount).toLocaleString("en-IN")}. How is this price charged?`, unitButtons(conv.id), env.fetchImpl);
  return "amount:ok";
}

// A tapped button: Yes / No, a unit, Send bid / Change, or the builder's Choose.
// Returns a short label for the log, such as "choose:matched".
export async function handleTap(sheet: ContractorSheet, t: IncomingTap, env: FlowEnv): Promise<string> {
  const [kind, id, extra] = t.data.split(":");
  if (kind === "p") return handlePick(sheet, t, id, Number(extra), env);
  const conv = demoState().conversations[id ?? ""];
  if (!conv || conv.chatId !== t.chatId) {
    await answerButton(env.token, t.callbackId, "This question is no longer open.", env.fetchImpl);
    return `${KIND[kind] ?? "unknown"}:${conv ? "other_chat" : "not_open"}`;
  }
  const now = nowOf(env);

  if ((kind === "y" || kind === "n") && conv.stage === "asked") {
    await removeButtons(env.token, t.chatId, t.messageId, env.fetchImpl);
    if (kind === "n") {
      setStage(conv.id, { stage: "declined" }, now);
      await answerButton(env.token, t.callbackId, "Noted", env.fetchImpl);
      await sendToChat(env.token, t.chatId, "Thanks for letting us know. We'll keep you in mind for future jobs.", env.fetchImpl);
      return "no:declined";
    }
    setStage(conv.id, { stage: "awaiting_amount" }, now);
    await answerButton(env.token, t.callbackId, "Great", env.fetchImpl);
    await sendToChat(env.token, t.chatId, "Great. What is your quotation for this job?\nPlease type the amount in rupees (numbers only, for example 1500). You can send only one bid.", env.fetchImpl);
    return "yes:asked_amount";
  }

  if (kind === "u" && conv.stage === "awaiting_unit") {
    const unit = RATE_UNITS[Number(extra)];
    if (!unit) {
      await answerButton(env.token, t.callbackId, "Please choose one of the buttons.", env.fetchImpl);
      return "unit:unknown_unit";
    }
    await removeButtons(env.token, t.chatId, t.messageId, env.fetchImpl);
    const check = validateBid({ amount: conv.amount, unit: unit.value });
    if (!check.ok) {
      setStage(conv.id, { stage: "awaiting_amount", amount: "" }, now);
      await answerButton(env.token, t.callbackId, "Please check the amount", env.fetchImpl);
      await sendToChat(env.token, t.chatId, `${Object.values(check.errors)[0] ?? "That amount is not valid."}
Please type the amount again (numbers only).`, env.fetchImpl);
      return "unit:amount_too_large";
    }
    // Only one bid is allowed, so the contractor confirms before it is saved.
    setStage(conv.id, { stage: "awaiting_confirm", unit: unit.value }, now);
    await answerButton(env.token, t.callbackId, "Please confirm", env.fetchImpl);
    await sendWithButtons(
      env.token,
      t.chatId,
      `Your bid: ${formatBidPrice(conv.amount, unit.value)}.
Send this bid? You can send only one bid for this job, and it cannot be changed after sending.`,
      [[{ text: "Send bid", data: `s:${conv.id}` }, { text: "Change", data: `x:${conv.id}` }]],
      env.fetchImpl,
    );
    return "unit:asked_confirm";
  }

  if (kind === "x" && conv.stage === "awaiting_confirm") {
    await removeButtons(env.token, t.chatId, t.messageId, env.fetchImpl);
    setStage(conv.id, { stage: "awaiting_amount", amount: "", unit: "" }, now);
    await answerButton(env.token, t.callbackId, "OK", env.fetchImpl);
    await sendToChat(env.token, t.chatId, "No problem. Please type your quotation amount again in rupees (numbers only, for example 1500).", env.fetchImpl);
    return "change:asked_amount";
  }

  if (kind === "s" && conv.stage === "awaiting_confirm") {
    const unit = RATE_UNITS.find((u) => u.value === conv.unit);
    if (!unit) {
      await answerButton(env.token, t.callbackId, "This question is no longer open.", env.fetchImpl);
      return "send:no_unit";
    }
    const result = await submitBid(sheet, { token: conv.bidToken, input: { amount: conv.amount, unit: unit.value, notes: "Quoted on Telegram" }, language: "en" }, { recordType: env.recordType, now }, () => env.newId("B"));
    await removeButtons(env.token, t.chatId, t.messageId, env.fetchImpl);
    if (result.ok) {
      setStage(conv.id, { stage: "bid", bidId: result.bidId }, now);
      await answerButton(env.token, t.callbackId, "Bid saved", env.fetchImpl);
      await sendToChat(
        env.token,
        t.chatId,
        `Thank you. Your bid of ${formatBidPrice(conv.amount, unit.value)} is recorded.${result.provisional ? "\nIt will count only after your start date is confirmed." : ""}\nThe builder will see all bids and choose. We'll tell you the result here.`,
        env.fetchImpl,
      );
      return "send:bid_saved";
    }
    if (result.error === "validation") {
      setStage(conv.id, { stage: "awaiting_amount", amount: "" }, now);
      await answerButton(env.token, t.callbackId, "Please check the amount", env.fetchImpl);
      await sendToChat(env.token, t.chatId, `${Object.values(result.errors)[0] ?? "That amount is not valid."}\nPlease type the amount again (numbers only).`, env.fetchImpl);
      return "send:invalid";
    }
    setStage(conv.id, { stage: "closed" }, now);
    await answerButton(env.token, t.callbackId, "Not saved", env.fetchImpl);
    const why = result.error === "already_bid" ? "A bid from you for this job was already received." : result.error === "closed" ? "Bidding for this job has closed." : "This job is no longer open for bids.";
    await sendToChat(env.token, t.chatId, why, env.fetchImpl);
    return `send:${result.error}`;
  }
  await answerButton(env.token, t.callbackId, "This question is no longer open.", env.fetchImpl);
  return `${KIND[kind] ?? "unknown"}:already_answered`; // an old button, tapped again
}

const KIND: Record<string, string> = { y: "yes", n: "no", u: "unit", s: "send", x: "change", p: "choose" };

// ---------------------------------------------------------------------------
// 3. Bids to the builder
// ---------------------------------------------------------------------------

function builderChatFor(requestId: string, env: FlowEnv): { chatId: string; to: "builder" | "founder" } | null {
  const s = demoState();
  const builderId = s.ticketBuilder[requestId];
  const link = builderId ? s.builderLinks[builderId] : undefined;
  if (link) return { chatId: link.chatId, to: "builder" };
  if (env.founderChatId && /^\d{1,20}$/.test(env.founderChatId)) return { chatId: env.founderChatId, to: "founder" };
  return null;
}

// Sends the bid summary for every ticket whose contractors have all answered, or
// whose first question went out at least 10 minutes ago. If a quote arrives
// after that (and nobody is chosen yet), an updated summary replaces it. A
// summary that Telegram did not accept is tried again on the next round.
export async function sendDueSummaries(sheet: ContractorSheet, env: FlowEnv): Promise<string[]> {
  const nowMs = nowOf(env).getTime();
  const byRequest = new Map<string, Conversation[]>();
  for (const c of Object.values(demoState().conversations)) byRequest.set(c.requestId, [...(byRequest.get(c.requestId) ?? []), c]);
  const sent: string[] = [];
  for (const [requestId, convs] of byRequest) {
    const previous = demoState().summaries[requestId];
    if (previous) {
      if (demoState().matches[requestId]) continue;
      const shown = new Set(previous.options.map((o) => o.bidId));
      const bids = (await loadBids(sheet, env.recordType)).filter((b) => b.requestId === requestId && !b.voided);
      if (bids.every((b) => shown.has(b.id))) continue;
      if (await sendSummary(sheet, requestId, convs, env, previous)) sent.push(requestId);
      continue;
    }
    const open = convs.some((c) => c.stage === "asked" || c.stage.startsWith("awaiting"));
    const firstAsk = Math.min(...convs.map((c) => Date.parse(c.askedAt)));
    if (open && nowMs - firstAsk < SUMMARY_AFTER_MS) continue;
    if (await sendSummary(sheet, requestId, convs, env)) sent.push(requestId);
  }
  return sent;
}

// Returns the summary once it is recorded: after Telegram accepted it, or at
// once when there is nobody to send it to. null means "try again later".
export async function sendSummary(sheet: ContractorSheet, requestId: string, convs: Conversation[], env: FlowEnv, previous?: BidSummary): Promise<BidSummary | null> {
  const request = await requestById(sheet, requestId, env.recordType);
  if (!request) return null;
  const bids = (await loadBids(sheet, env.recordType)).filter((b) => b.requestId === requestId && !b.voided);
  const contractors = await loadContractors(sheet);
  const ratings = await loadSummaries(sheet, env.recordType).catch(() => new Map());
  const latest = latestByPair(await orEmpty(loadConfirmations(sheet, env.recordType)));
  const nameOf = (id: string) => contractors.find((c) => c.id === id)?.name || id;

  const rows = [];
  for (const b of bids) {
    const found = await findRequestAndCandidate(sheet, requestId, b.contractorId, env.recordType, env.now);
    const ok = standing(found?.candidate, latest.get(pairKey(requestId, b.contractorId)), request).ok;
    rows.push({ ...b, ok });
  }
  const summaryId = shortId();
  const options: { bidId: string; contractorId: string }[] = [];
  const lines = [previous ? "Contractor Desk · Updated bids: a new quote arrived" : "Contractor Desk · Bids for your ticket",`Ticket ${requestId}: ${request.trade} in ${request.area}`, ...jobLines(request).slice(1), ""];
  if (rows.length === 0) lines.push("No contractor sent a quotation for this ticket.");
  else {
    lines.push("Prices are compared only within the same unit. We never add them up into a total.");
    for (const g of groupByUnit(rows)) {
      lines.push("", `${g.label[0].toUpperCase()}${g.label.slice(1)}:`);
      for (const b of g.bids) {
        const n = options.length + 1;
        const summary = ratings.get(b.contractorId);
        lines.push(`${n}. ${nameOf(b.contractorId)}: ${formatBidPrice(b.amount, b.unit)} · ${ratingText(summary)}${b.ok ? "" : " · start date not confirmed yet, cannot be chosen"}`);
        options.push({ bidId: b.id, contractorId: b.contractorId });
      }
      if (g.fixedScope) lines.push("Fixed prices are comparable only if they cover the same scope.");
    }
  }
  const declined = convs.filter((c) => c.stage === "declined").length;
  const silent = convs.filter((c) => c.stage === "asked" || c.stage.startsWith("awaiting")).length;
  lines.push("", `Asked: ${convs.length} · Quoted: ${rows.length} · Declined: ${declined} · No answer yet: ${silent}`);

  const dest = builderChatFor(requestId, env);
  const buttons = rows
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.ok)
    .map(({ b }) => {
      const n = options.findIndex((o) => o.bidId === b.id);
      return [{ text: `Choose ${n + 1}. ${nameOf(b.contractorId)}`.slice(0, 60), data: `p:${summaryId}:${n}` }];
    });
  if (buttons.length) lines.push("Tap a button to choose. You'll then get the contractor's number, and they'll get yours.");
  if (dest?.to === "founder") lines.unshift("(Sent to the Contractor Desk team: the builder has not connected Telegram.)");

  const summary: BidSummary = { id: summaryId, requestId, sentAt: nowOf(env).toISOString(), to: dest?.to ?? "nobody", options };
  if (dest) {
    const text = lines.join("\n");
    const result = buttons.length ? await sendWithButtons(env.token, dest.chatId, text, buttons, env.fetchImpl) : await sendToChat(env.token, dest.chatId, text, env.fetchImpl);
    if (!result.ok) return null; // not recorded: the next round tries again
    summary.chatId = dest.chatId;
    summary.messageId = result.messageId;
    // The older message's Choose buttons would no longer work: remove them.
    if (previous?.chatId && previous.messageId) await removeButtons(env.token, previous.chatId, previous.messageId, env.fetchImpl);
  }
  updateDemo((s) => {
    s.summaries[requestId] = summary;
  });
  return summary;
}

// ---------------------------------------------------------------------------
// 4. The builder chooses
// ---------------------------------------------------------------------------

async function handlePick(sheet: ContractorSheet, t: IncomingTap, summaryId: string | undefined, index: number, env: FlowEnv): Promise<string> {
  const s = demoState();
  const summary = Object.values(s.summaries).find((x) => x.id === summaryId);
  const dest = summary ? builderChatFor(summary.requestId, env) : null;
  if (!summary || !dest || dest.chatId !== t.chatId) {
    await answerButton(env.token, t.callbackId, "This choice is no longer open.", env.fetchImpl);
    return summary ? `choose:not_builder_chat ${summary.requestId}` : "choose:unknown_summary";
  }
  const option = summary.options[index];
  if (!option) {
    await answerButton(env.token, t.callbackId, "Please choose one of the buttons.", env.fetchImpl);
    return `choose:unknown_option ${summary.requestId}`;
  }
  const already = s.matches[summary.requestId];
  if (already) {
    await answerButton(env.token, t.callbackId, "Already matched for this ticket.", env.fetchImpl);
    return `choose:already_matched ${summary.requestId}`;
  }
  const now = nowOf(env);
  const picked = await selectBidder(sheet, { requestId: summary.requestId, bidId: option.bidId }, env, () => env.newId("J"));
  if (!picked.ok) {
    const why = picked.error === "not_confirmed" ? "This contractor's start date is not confirmed yet." : picked.error === "already_selected" ? "A contractor is already selected for this ticket." : "This bid can no longer be chosen.";
    await answerButton(env.token, t.callbackId, why, env.fetchImpl);
    return `choose:refused_${picked.error} ${summary.requestId}`;
  }
  updateDemo((x) => {
    x.matches[summary.requestId] = { requestId: summary.requestId, bidId: option.bidId, contractorId: option.contractorId, matchedAt: now.toISOString() };
  });
  await removeButtons(env.token, t.chatId, t.messageId, env.fetchImpl);
  await answerButton(env.token, t.callbackId, "Matched", env.fetchImpl);

  // Contact details: recorded in the job history like any other viewing.
  const request = await requestById(sheet, summary.requestId, env.recordType);
  const shared = await shareContact(sheet, { requestId: summary.requestId }, { ...env, realContactAllowed: false, syntheticContactAllowed: true });
  const builder = s.builders[s.ticketBuilder[summary.requestId] ?? ""];
  const bid = (await loadBids(sheet, env.recordType)).find((b) => b.id === option.bidId);
  const contractorName = shared.ok ? shared.contractorName : option.contractorId;
  const contractorPhone = shared.ok && shared.phone ? shared.phone : "not available";
  const builderName = builder ? `${builder.name}${builder.company ? ` (${builder.company})` : ""}` : request?.developerName || "the builder";
  const builderPhone = builder?.phone ?? "shared by Contractor Desk";
  const job = request ? `${request.trade} in ${request.area}` : summary.requestId;

  await sendToChat(env.token, t.chatId, `Matched for ticket ${summary.requestId} (${job}).\nContractor: ${contractorName}\nQuote: ${bid ? formatBidPrice(bid.amount, bid.unit) : "-"}\nPhone: ${contractorPhone}\nWe have also sent them your name and number.`, env.fetchImpl);
  const winner = Object.values(demoState().conversations).find((c) => c.requestId === summary.requestId && c.contractorId === option.contractorId);
  if (winner) await sendToChat(env.token, winner.chatId, `Good news: you were chosen for ${job} (ticket ${summary.requestId}).\nBuilder: ${builderName}\nPhone: ${builderPhone}\nPlease call them to confirm the start.`, env.fetchImpl);
  for (const c of Object.values(demoState().conversations)) {
    if (c.requestId !== summary.requestId) continue;
    if (c.contractorId !== option.contractorId && c.stage === "bid") await sendToChat(env.token, c.chatId, `Thank you for your quote for ${job}. The builder chose another contractor this time.`, env.fetchImpl);
    setStage(c.id, { stage: "closed" }, now);
  }
  return `choose:matched ${summary.requestId}`;
}

export type { SendError };
