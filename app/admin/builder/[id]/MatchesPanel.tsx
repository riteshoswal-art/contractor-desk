"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/match";
import type { NotifyItem } from "@/lib/notify";
import { SEND_ERROR_TEXT } from "@/lib/telegram";
import { notifyMatchesAction, pairingLinkAction, syncConnectionsAction } from "../actions";

export type MatchRow = {
  id: string;
  name: string;
  fit: "on_date" | "needs_confirmation";
  fitText: string;
  reasons: string[];
  connected: boolean;
  telegramName: string;
  notice: { status: string; detail?: string; at: string } | null;
  hasBid: boolean;
  unavailable: boolean;
};

const button = "rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60";
const quiet = "rounded-md border border-zinc-400 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60";

const REASON: Record<string, string> = {
  recently_sent: "already notified in the last minute",
  already_bid: "already bid",
  not_candidate: "no longer a match",
  unavailable: "said unavailable",
  bidding_not_open: "bidding is not open",
  invalid: "not valid",
  not_found: "not found",
};
const PROBLEM: Record<string, string> = {
  demo_only: "This works only in the local data mode.",
  no_token: "The Telegram bot is not set up yet (TELEGRAM_BOT_TOKEN). See the Telegram page.",
  bot_unreachable: "Could not reach the Telegram bot. Check the internet connection and the token.",
  not_found: "That contractor was not found.",
  too_many_requests: "Too many clicks just now. Please wait a minute.",
  setup: "A tab this needs is not set up. Nothing was saved.",
  service_error: "Something went wrong. Nothing was sent.",
};
const problem = (e: string) => PROBLEM[e] ?? (SEND_ERROR_TEXT as Record<string, string>)[e] ?? PROBLEM.service_error;

function noticeText(n: { status: string; detail?: string }): { text: string; tone: string } {
  switch (n.status) {
    case "sent":
      return { text: "Sent to their Telegram", tone: "bg-green-100 text-green-900" };
    case "preview":
      return { text: "Preview only (not sent)", tone: "bg-amber-100 text-amber-900" };
    case "failed":
      return { text: `Failed: ${(SEND_ERROR_TEXT as Record<string, string>)[n.detail ?? ""] ?? "not sent"}`, tone: "bg-red-100 text-red-900" };
    case "not_connected":
      return { text: "Not connected: nothing sent", tone: "bg-zinc-100 text-zinc-700" };
    default:
      return { text: `Skipped: ${REASON[n.detail ?? ""] ?? n.detail ?? ""}`, tone: "bg-zinc-100 text-zinc-700" };
  }
}

export default function MatchesPanel({ requestId, rows, botReady, builderAlertsReady }: { requestId: string; rows: MatchRow[]; botReady: boolean; builderAlertsReady: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<NotifyItem[] | null>(null);
  const [pairing, setPairing] = useState<{ id: string; url: string; expiresAt: string } | null>(null);
  const eligible = rows.filter((r) => !r.hasBid && !r.unavailable).map((r) => r.id);
  const connectedEligible = rows.filter((r) => !r.hasBid && !r.unavailable && r.connected).length;

  async function run(key: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setMessage("");
    try {
      await work();
    } catch {
      setMessage(PROBLEM.service_error);
    }
    setBusy("");
  }

  const sync = () =>
    run("sync", async () => {
      const r = await syncConnectionsAction();
      if (!r.ok) return setMessage(problem(r.error));
      setMessage(r.connected.length ? `Connected: ${r.connected.map((c) => c.name || c.contractorId).join(", ")}.` : "No new connections yet. Ask the contractor to open their link and press Start.");
      router.refresh();
    });

  const notify = () =>
    run("notify", async () => {
      setResults(null);
      const r = await notifyMatchesAction(requestId, eligible);
      if (!r.ok) return setMessage(problem(r.error));
      setResults(r.items);
      router.refresh();
    });

  const connect = (id: string) =>
    run(`pair-${id}`, async () => {
      setPairing(null);
      const r = await pairingLinkAction(id);
      if (!r.ok) return setMessage(problem(r.error));
      setPairing({ id, url: r.url, expiresAt: r.expiresAt });
    });

  return (
    <section aria-labelledby="matches-heading" className="mt-8 rounded-md border border-zinc-300 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="matches-heading" className="text-lg font-semibold">
          1. Matched contractors and Telegram notifications
        </h2>
        <p className="text-xs text-zinc-600">
          Bot: {botReady ? "set up" : "not set up"} · Builder bid alerts: {builderAlertsReady ? "on" : "off (TELEGRAM_FOUNDER_CHAT_ID missing)"}
        </p>
      </div>
      <p className="mt-1 text-sm text-zinc-700">
        Matched by trade, locality, availability and start date. Each connected contractor gets one private Telegram message with only
        their own bid link. Nothing is sent until you press a button.
      </p>

      {rows.length === 0 && <p className="mt-4 text-sm text-zinc-700">No registered contractor matches this ticket yet.</p>}

      <ul className="mt-4 space-y-3">
        {rows.map((r) => {
          const n = r.notice ? noticeText(r.notice) : null;
          return (
            <li key={r.id} className="rounded-md border border-zinc-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="font-semibold">{r.name || "Name not given"}</span> <span className="font-mono text-xs text-zinc-600">{r.id}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.fit === "on_date" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{r.fitText}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.connected ? "bg-sky-100 text-sky-900" : "bg-zinc-100 text-zinc-700"}`}>
                    {r.connected ? `Telegram connected${r.telegramName ? ` (${r.telegramName})` : ""}` : "Telegram not connected"}
                  </span>
                  {r.hasBid && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-900">Bid received</span>}
                  {r.unavailable && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">Said unavailable</span>}
                </div>
              </div>
              <ul className="mt-2 list-disc pl-5 text-zinc-700">
                {r.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {n && <span className={`rounded-md px-2 py-1 text-xs font-semibold ${n.tone}`}>Notification: {n.text}</span>}
                {!r.connected && botReady && (
                  <button type="button" className={quiet} disabled={busy !== ""} onClick={() => connect(r.id)}>
                    {busy === `pair-${r.id}` ? "Creating…" : "Create Telegram connect link"}
                  </button>
                )}
              </div>
              {pairing?.id === r.id && (
                <div role="status" className="mt-2 rounded-md border border-sky-300 bg-sky-50 p-2">
                  <p className="font-medium">Give this link to {r.name || "the contractor"} only. They open it on their phone and press Start.</p>
                  <input readOnly value={pairing.url} onFocus={(e) => e.currentTarget.select()} className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs" aria-label="Telegram connect link" />
                  <p className="mt-1 text-xs text-zinc-600">Works once, until {formatDate(pairing.expiresAt)} (30 minutes). Then press &ldquo;Check for new connections&rdquo;.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={quiet} disabled={busy !== "" || !botReady} onClick={sync}>
          {busy === "sync" ? "Checking…" : "Check for new connections"}
        </button>
        <button type="button" className={button} disabled={busy !== "" || eligible.length === 0} onClick={notify}>
          {busy === "notify" ? "Sending…" : `Send job to matched contractors (${connectedEligible} connected of ${eligible.length})`}
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-sm font-medium text-zinc-900">{message}</p>}

      {results && (
        <div role="status" className="mt-3 rounded-md border border-zinc-300 p-3 text-sm">
          <p className="font-medium">Results (only &ldquo;Sent&rdquo; means Telegram confirmed delivery)</p>
          <ul className="mt-2 space-y-2">
            {results.map((i) => {
              const n = noticeText({ status: i.status, detail: i.reason ?? i.error });
              return (
                <li key={i.contractorId}>
                  <span className="font-medium">{i.name || i.contractorId}</span>: <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${n.tone}`}>{n.text}</span>
                  {i.status === "sent" && i.link && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-blue-800">The link that was sent (for your eyes only)</summary>
                      <input readOnly value={i.link} onFocus={(e) => e.currentTarget.select()} className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs" aria-label={`Link sent to ${i.name}`} />
                    </details>
                  )}
                  {i.status === "preview" && i.preview && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-blue-800">Message preview</summary>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{i.preview}</pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
