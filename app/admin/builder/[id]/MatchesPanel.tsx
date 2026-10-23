"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/match";
import type { NotifyItem } from "@/lib/notify";
import { SEND_ERROR_TEXT } from "@/lib/telegram";
import { notifyMatchesAction, pairingLinkAction, syncConnectionsAction } from "../actions";
import { Icon } from "../../../ui";
import { initials } from "../../requests/[id]/detail-ui";

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


const REASON: Record<string, string> = {
  already_asked: "already asked on Telegram",
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
      return { text: "Sent to their Telegram", tone: "pill-ok" };
    case "preview":
      return { text: "Preview only (not sent)", tone: "pill-warn" };
    case "failed":
      return { text: `Failed: ${(SEND_ERROR_TEXT as Record<string, string>)[n.detail ?? ""] ?? "not sent"}`, tone: "pill-warn" };
    case "not_connected":
      return { text: "Not connected: nothing sent", tone: "pill-muted" };
    default:
      return { text: `Skipped: ${REASON[n.detail ?? ""] ?? n.detail ?? ""}`, tone: "pill-muted" };
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
    <section aria-labelledby="matches-heading" className="stack" style={{ ["--gap" as string]: "12px" }}>
      <div className="group-head">
        <h2 id="matches-heading" className="h2">
          1. Matched contractors and Telegram notifications
        </h2>
        <span className="tiny muted">
          Bot: {botReady ? "set up" : "not set up"} · Builder bid alerts: {builderAlertsReady ? "on" : "off (TELEGRAM_FOUNDER_CHAT_ID missing)"}
        </span>
      </div>
      <p className="notice notice-muted" style={{ margin: 0 }}>
        <span style={{ marginTop: 2 }}>
          <Icon name="info" size={18} />
        </span>
        <span>
          Matched by trade, locality, availability and start date. Each available, connected contractor gets the job on
          Telegram with Yes / No buttons and quotes there. Nothing is sent until you press a button.
        </span>
      </p>

      {rows.length === 0 && (
        <div className="card empty">
          <p className="muted" style={{ margin: 0 }}>No registered contractor matches this ticket yet.</p>
        </div>
      )}

      <ul className="stack" style={{ ["--gap" as string]: "12px", listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((r) => {
          const n = r.notice ? noticeText(r.notice) : null;
          return (
            <li key={r.id} className="card flat stack" style={{ ["--gap" as string]: "10px", padding: 0 }}>
              <div className="match-row">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <span className="avatar" aria-hidden="true">
                    {initials(r.name || "Name not given")}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="h3">
                      {r.name || "Name not given"} <span className="mono muted">{r.id}</span>
                    </div>
                    <ul className="small muted" style={{ margin: "2px 0 0", padding: 0, listStyle: "none" }}>
                      {r.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`pill ${r.fit === "on_date" ? "pill-ok" : "pill-warn"}`} style={{ whiteSpace: "normal" }}>{r.fitText}</span>
                  <span className={`pill plain ${r.connected ? "pill-info" : "pill-muted"}`}>
                    <Icon name="send" size={12} />
                    {r.connected ? `Telegram connected${r.telegramName ? ` (${r.telegramName})` : ""}` : "Telegram not connected"}
                  </span>
                  {r.hasBid && <span className="pill pill-muted plain">Bid received</span>}
                  {r.unavailable && <span className="pill pill-warn">Said unavailable</span>}
                  <span className="pill pill-muted plain">
                    <Icon name="lock" size={12} /> Phone hidden
                  </span>
                </div>
              </div>
              {(n || (!r.connected && botReady) || pairing?.id === r.id) && (
                <div className="stack" style={{ ["--gap" as string]: "8px", padding: "0 18px 16px" }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {n && <span className={`pill ${n.tone}`} style={{ whiteSpace: "normal" }}>Notification: {n.text}</span>}
                    {!r.connected && botReady && (
                      <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} disabled={busy !== ""} onClick={() => connect(r.id)}>
                        {busy === `pair-${r.id}` ? "Creating…" : "Create Telegram connect link"}
                      </button>
                    )}
                  </div>
                  {pairing?.id === r.id && (
                    <div role="status" className="notice notice-info" style={{ display: "block" }}>
                      <b>Give this link to {r.name || "the contractor"} only. They open it on their phone and press Start.</b>
                      <input readOnly value={pairing.url} onFocus={(e) => e.currentTarget.select()} className="input mono" style={{ marginTop: 8 }} aria-label="Telegram connect link" />
                      <p className="help">Works once, until {formatDate(pairing.expiresAt)} (30 minutes). Then press &ldquo;Check for new connections&rdquo;.</p>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost" disabled={busy !== "" || !botReady} onClick={sync}>
          {busy === "sync" ? "Checking…" : "Check for new connections"}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy !== "" || eligible.length === 0} onClick={notify}>
          <Icon name="send" size={16} />
          {busy === "notify" ? "Sending…" : `Send job to matched contractors (${connectedEligible} connected of ${eligible.length})`}
        </button>
      </div>
      {message && (
        <p role="status" className="notice notice-muted" style={{ margin: 0 }}>
          <b>{message}</b>
        </p>
      )}

      {results && (
        <div role="status" className="card stack" style={{ ["--gap" as string]: "10px" }}>
          <span className="eyebrow">Results (only &ldquo;Sent&rdquo; means Telegram confirmed delivery)</span>
          <ul className="stack" style={{ ["--gap" as string]: "8px", listStyle: "none", padding: 0, margin: 0 }}>
            {results.map((i) => {
              const n = noticeText({ status: i.status, detail: i.reason ?? i.error });
              return (
                <li key={i.contractorId} className="small">
                  <b>{i.name || i.contractorId}</b>: <span className={`pill ${n.tone}`} style={{ whiteSpace: "normal" }}>{n.text}</span>
                  {i.status === "sent" && i.link && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>The link that was sent (for your eyes only)</summary>
                      <input readOnly value={i.link} onFocus={(e) => e.currentTarget.select()} className="input mono" style={{ marginTop: 6 }} aria-label={`Link sent to ${i.name}`} />
                    </details>
                  )}
                  {i.status === "preview" && i.preview && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Message preview</summary>
                      <pre className="quote tiny whitespace-pre-wrap" style={{ marginTop: 6 }}>{i.preview}</pre>
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
