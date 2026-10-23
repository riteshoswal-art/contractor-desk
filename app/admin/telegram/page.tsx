import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { botHealth, botListening, demoState } from "@/lib/demo-store";
import { fixturesEnabled } from "@/lib/fixtures";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { formatDate } from "@/lib/match";
import { loadContractors } from "@/lib/records";
import { describeConfig, telegramConfig } from "@/lib/telegram";
import { Icon } from "../../ui";
import AdminShell from "../AdminShell";
import ContractorLinks, { type ContractorRow } from "./ContractorLinks";
import TelegramTools from "./TelegramTools";

export const metadata: Metadata = { title: "Telegram | Contractor Desk" };

export default function TelegramPage() {
  return (
    <Suspense fallback={<p className="page small muted">Loading…</p>}>
      <AdminShell>
        <TelegramStatus />
      </AdminShell>
    </Suspense>
  );
}

// "Last contact with Telegram: 4 seconds ago", or how long it has been failing.
// The listener asks Telegram at least every 25 seconds, so anything much older
// than that means this computer cannot reach Telegram.
function healthText(): string {
  const h = botHealth();
  const ago = (iso: string) => {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    return s < 90 ? `${s} seconds ago` : `${Math.round(s / 60)} minutes ago`;
  };
  if (h.failuresInARow > 0)
    return `The last ${h.failuresInARow} attempt${h.failuresInARow === 1 ? "" : "s"} to reach Telegram failed (${h.lastError}). Last success: ${h.lastOkAt ? ago(h.lastOkAt) : "none yet"}. It keeps retrying by itself.`;
  return h.lastOkAt ? `Last contact with Telegram: ${ago(h.lastOkAt)}.` : "Waiting for the first contact with Telegram (up to 25 seconds after a start).";
}

async function TelegramStatus() {
  await connection(); // reads the server's settings at request time
  const cfg = describeConfig(telegramConfig());
  const hasToken = Boolean((process.env.TELEGRAM_BOT_TOKEN ?? "").trim());
  const recordType = getRecordType();
  const local = fixturesEnabled();
  let rows: ContractorRow[] = [];
  if (local) {
    const links = demoState().links;
    rows = (await loadContractors(getContractorSheet()))
      .filter((c) => c.recordType === recordType)
      .map((c) => ({
        id: c.id,
        name: c.name,
        trade: c.trade,
        area: c.serviceAreas.join(", "),
        status: c.availability === "now" ? "available now" : c.availability === "from_date" ? `available from ${formatDate(c.earliestStart)}` : "not available",
        connectedAs: links[c.id] ? links[c.id].telegramName || "yes" : "",
      }))
      .sort((a, b) => Number(Boolean(b.connectedAs)) - Number(Boolean(a.connectedAs)) || a.trade.localeCompare(b.trade) || a.name.localeCompare(b.name));
  }
  const failing = botHealth().failuresInARow > 0;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Operator</span>
        <h1 className="h1" style={{ marginTop: 4 }}>
          Telegram
        </h1>
        <p className="lead-sm" style={{ marginTop: 8, maxWidth: 820 }}>
          How a ticket raised on the builder page runs: each available, connected contractor for that trade and area gets the job
          with <strong>Yes / No</strong>. &ldquo;Yes&rdquo; asks for the price, the unit, then <strong>Send bid / Change</strong> (one
          bid each). When everyone has answered, or after 10 minutes, the builder&apos;s chat gets all quotes with a{" "}
          <strong>Choose</strong> button each; after the choice both get each other&apos;s name and number. Only people who pressed
          Start in the bot are ever messaged.
        </p>
      </div>

      <div className="stack" style={{ ["--gap" as string]: "16px" }}>
        <div className={local ? "grid grid-2" : "stack"} style={{ alignItems: "stretch" }}>
          {local && (
            <section className="card stack" style={{ ["--gap" as string]: "10px" }} aria-label="Bot health">
              <div className="row between wrap" style={{ gap: 8 }}>
                <span className="row" style={{ gap: 10 }}>
                  <span className="ic-box">
                    <Icon name="send" />
                  </span>
                  <span className="h3">Bot</span>
                </span>
                <span className={`pill ${!botListening() ? "pill-muted" : failing ? "pill-warn" : "pill-ok"}`}>
                  {botListening() ? (failing ? "Not answering" : "Running") : "Not running"}
                </span>
              </div>
              <p
                className={`notice ${!botListening() ? "notice-muted" : failing ? "notice-warn" : "notice-ok"}`}
                style={{ display: "block" }}
              >
                <strong>{botListening() ? (failing ? "Bot running, but Telegram is not answering." : "Bot running.") : "Bot not running."}</strong>{" "}
                {botListening() ? healthText() : "It starts with the server when a bot token is set."}
              </p>
            </section>
          )}

          <section className="card stack" style={{ ["--gap" as string]: "10px" }} aria-label="Settings">
            <div className="row between wrap" style={{ gap: 8 }}>
              <span className="row" style={{ gap: 10 }}>
                <span className="ic-box">
                  <Icon name="lock" />
                </span>
                <span className="h3">Settings</span>
              </span>
              <span className={`pill ${cfg.configured ? "pill-ok" : "pill-warn"}`}>{cfg.configured ? "Set up" : "Not set up"}</span>
            </div>
            <div className={`notice ${cfg.configured ? "notice-muted" : "notice-warn"}`} style={{ display: "block" }}>
              {cfg.configured ? (
                <p style={{ margin: 0 }}>
                  <strong>Set up.</strong> Bot token: present (never shown). Founder chat: <span className="mono">{cfg.chatIdMasked}</span>.
                </p>
              ) : (
                <div className="stack" style={{ ["--gap" as string]: "4px" }}>
                  <p style={{ margin: 0 }}>
                    <strong>Not set up yet.</strong> Nothing can be sent on Telegram.
                  </p>
                  {cfg.missing.length > 0 && (
                    <p style={{ margin: 0 }}>
                      Missing: {cfg.missing.map((m) => <code key={m} className="mono" style={{ marginRight: 8 }}>{m}</code>)}
                    </p>
                  )}
                  {cfg.invalid.length > 0 && (
                    <p style={{ margin: 0 }}>
                      Not in the expected format: {cfg.invalid.map((m) => <code key={m} className="mono" style={{ marginRight: 8 }}>{m}</code>)}
                    </p>
                  )}
                </div>
              )}
              {recordType !== "TEST" && <p style={{ margin: "8px 0 0", fontWeight: 600 }}>This server uses real records, so nothing is sent on Telegram.</p>}
            </div>
          </section>
        </div>

        {rows.length > 0 && <ContractorLinks rows={rows} />}

        <TelegramTools configured={cfg.configured} hasToken={hasToken} />

        <details className="card small" style={{ lineHeight: 1.6 }}>
          <summary className="cursor-pointer h3">One-time setup (about 5 minutes)</summary>
          <ol style={{ margin: "12px 0 0", paddingLeft: 20, listStyle: "decimal" }} className="stack-sm">
            <li>
              In Telegram, open <strong>@BotFather</strong> (the official bot with a blue tick), send <code>/newbot</code>, and follow the
              questions. It gives you a <strong>bot token</strong>. Treat it like a password.
            </li>
            <li>
              On your own phone, open the new bot and press <strong>Start</strong>. A bot can only message people who did this.
            </li>
            <li>
              Open the file <code>.env.local</code> in the project folder and add a line <code>TELEGRAM_BOT_TOKEN=</code> followed by the
              token. Save, then stop and restart the server.
            </li>
            <li>
              Come back to this page and press <strong>Find my chat ID</strong>. Add a line <code>TELEGRAM_FOUNDER_CHAT_ID=</code>{" "}
              followed by your number, save, and restart the server again.
            </li>
            <li>Press <strong>Send a test message</strong>. Only a &ldquo;Delivered&rdquo; message here means it really arrived.</li>
          </ol>
          <p className="muted" style={{ margin: "12px 0 0" }}>
            Never paste the token into a chat, a document or the Sheet. To stop the bot, revoke the token in @BotFather.
          </p>
        </details>
      </div>
    </>
  );
}
