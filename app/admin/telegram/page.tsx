import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { botHealth, botListening, demoState } from "@/lib/demo-store";
import { fixturesEnabled } from "@/lib/fixtures";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { formatDate } from "@/lib/match";
import { loadContractors } from "@/lib/records";
import { describeConfig, telegramConfig } from "@/lib/telegram";
import AdminShell from "../AdminShell";
import ContractorLinks, { type ContractorRow } from "./ContractorLinks";
import TelegramTools from "./TelegramTools";

export const metadata: Metadata = { title: "Telegram | Contractor Desk" };

export default function TelegramPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
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
    <div className="mt-8 space-y-8">
      <div className="space-y-2">
        <p className="cb-eyebrow">Operator</p>
        <h1 className="text-3xl font-semibold">Telegram</h1>
        <p className="text-sm leading-6 text-zinc-600">
          How a ticket raised on the builder page runs: each available, connected contractor for that trade and area gets the job
          with <strong>Yes / No</strong>. &ldquo;Yes&rdquo; asks for the price, the unit, then <strong>Send bid / Change</strong> (one
          bid each). When everyone has answered, or after 10 minutes, the builder&apos;s chat gets all quotes with a{" "}
          <strong>Choose</strong> button each; after the choice both get each other&apos;s name and number. Only people who pressed
          Start in the bot are ever messaged.
        </p>
      </div>

      {local && (
        <div
          className={`rounded-[20px] px-4 py-3.5 text-sm ${!botListening() ? "bg-[var(--surface-2)]" : failing ? "bg-[var(--warn-bg)] text-[var(--warn-ink)]" : "bg-[var(--ok-bg)] text-[var(--ok-ink)]"}`}
        >
          <strong>{botListening() ? (failing ? "Bot running, but Telegram is not answering." : "Bot running.") : "Bot not running."}</strong>{" "}
          {botListening() ? healthText() : "It starts with the server when a bot token is set."}
        </div>
      )}

      <div className={`rounded-[20px] px-4 py-3.5 text-sm ${cfg.configured ? "bg-[var(--surface-2)]" : "bg-[var(--warn-bg)] text-[var(--warn-ink)]"}`}>
        {cfg.configured ? (
          <p>
            <strong>Set up.</strong> Bot token: present (never shown). Founder chat: <span className="font-mono">{cfg.chatIdMasked}</span>.
          </p>
        ) : (
          <div className="space-y-1">
            <p>
              <strong>Not set up yet.</strong> Nothing can be sent on Telegram.
            </p>
            {cfg.missing.length > 0 && <p>Missing: {cfg.missing.map((m) => <code key={m} className="mr-2">{m}</code>)}</p>}
            {cfg.invalid.length > 0 && <p>Not in the expected format: {cfg.invalid.map((m) => <code key={m} className="mr-2">{m}</code>)}</p>}
          </div>
        )}
        {recordType !== "TEST" && <p className="mt-2 font-medium">This server uses real records, so nothing is sent on Telegram.</p>}
      </div>

      {rows.length > 0 && <ContractorLinks rows={rows} />}

      <TelegramTools configured={cfg.configured} hasToken={hasToken} />

      <details className="rounded-[20px] border border-[var(--line)] p-4 text-sm leading-6">
        <summary className="cursor-pointer font-semibold">One-time setup (about 5 minutes)</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
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
        <p className="mt-3 text-zinc-600">Never paste the token into a chat, a document or the Sheet. To stop the bot, revoke the token in @BotFather.</p>
      </details>
    </div>
  );
}
