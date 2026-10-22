import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getRecordType } from "@/lib/google-sheets";
import { describeConfig, telegramConfig } from "@/lib/telegram";
import AdminShell from "../AdminShell";
import TelegramTools from "./TelegramTools";

export const metadata: Metadata = { title: "Telegram demo | Contractor Desk" };

export default function TelegramPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <TelegramStatus />
      </AdminShell>
    </Suspense>
  );
}

async function TelegramStatus() {
  await connection(); // reads the server's settings at request time
  const cfg = describeConfig(telegramConfig());
  const hasToken = Boolean((process.env.TELEGRAM_BOT_TOKEN ?? "").trim());
  const recordType = getRecordType();

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Telegram (demo channel)</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          Telegram is the stand-in messaging channel for the live demo, not the production choice. Two kinds of message, both only in
          the live demo (<code>npm run demo</code>, TEST data), and only when you press a button or a contractor submits a bid:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-700">
          <li>
            <strong>Job opportunities</strong> go to each contractor who <strong>connected their own Telegram</strong> (they press Start
            in the bot with a one-time link). Each message has only that contractor&apos;s own bid link.
          </li>
          <li>
            <strong>New-bid alerts</strong> go to the <strong>builder&apos;s chat</strong> (<code>TELEGRAM_DEMO_CHAT_ID</code>), one per
            newly saved bid. Contractor bid links never go there.
          </li>
        </ul>
        <p className="mt-2 text-sm leading-6 text-zinc-700">Nobody else is messaged.</p>
      </div>

      <div className={`rounded-md border p-4 text-sm ${cfg.configured ? "border-green-300 bg-green-50 text-green-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
        {cfg.configured ? (
          <p>
            <strong>Set up.</strong> Bot token: present (never shown). Demo chat: <span className="font-mono">{cfg.chatIdMasked}</span>.
          </p>
        ) : (
          <div className="space-y-1">
            <p>
              <strong>Not set up yet.</strong> Notifications will be shown as previews and marked &ldquo;not sent&rdquo;.
            </p>
            {cfg.missing.length > 0 && <p>Missing: {cfg.missing.map((m) => <code key={m} className="mr-2">{m}</code>)}</p>}
            {cfg.invalid.length > 0 && <p>Not in the expected format: {cfg.invalid.map((m) => <code key={m} className="mr-2">{m}</code>)}</p>}
          </div>
        )}
        {recordType !== "TEST" && <p className="mt-2 font-medium">This server uses REAL data, so no notification will be created or sent.</p>}
      </div>

      <TelegramTools configured={cfg.configured} hasToken={hasToken} />

      <div className="rounded-md border border-zinc-300 p-4 text-sm leading-6">
        <h2 className="text-base font-semibold">One-time setup (about 5 minutes)</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            In Telegram, open <strong>@BotFather</strong> (the official bot with a blue tick), send <code>/newbot</code>, and follow the
            questions. It gives you a <strong>bot token</strong>. Treat it like a password.
          </li>
          <li>
            On the <strong>builder&apos;s phone</strong> (yours for the demo), open the new bot and press <strong>Start</strong>. A bot can
            only message people who did this.
          </li>
          <li>
            Open the file <code>.env.local</code> in the project folder and add a line <code>TELEGRAM_BOT_TOKEN=</code> followed by the
            token. Save, then stop and restart the server.
          </li>
          <li>
            Come back to this page and press <strong>Find my chat ID</strong>. Add a line <code>TELEGRAM_DEMO_CHAT_ID=</code> followed by
            your number, save, and restart the server again.
          </li>
          <li>Press <strong>Send a test message</strong>. Only a &ldquo;Delivered&rdquo; message here means it really arrived.</li>
          <li>
            Contractors connect themselves: after registering on the demo site they see <strong>Connect Telegram</strong>, open it and
            press Start. (For someone already registered, use <strong>Create Telegram connect link</strong> on a ticket.) Then press
            <strong> Check for new connections</strong> on the ticket.
          </li>
        </ol>
        <p className="mt-3 text-zinc-600">
          Never paste the token into a chat, a document or the Sheet. To stop the bot, revoke the token in @BotFather.
        </p>
      </div>
    </div>
  );
}
