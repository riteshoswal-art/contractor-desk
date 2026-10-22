"use client";

import { useState } from "react";
import { SEND_ERROR_TEXT } from "@/lib/telegram";
import { findTelegramChatsAction, sendTelegramTestAction } from "./actions";

const button =
  "rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60";
const quietButton =
  "rounded-md border border-zinc-400 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60";

const EXTRA: Record<string, string> = {
  too_many_requests: "Too many attempts just now. Please wait a few minutes.",
  no_token: "Add TELEGRAM_BOT_TOKEN to .env.local first and restart the server.",
};
const say = (error: string) => (SEND_ERROR_TEXT as Record<string, string>)[error] ?? EXTRA[error] ?? "Something went wrong. Nothing was sent.";

export default function TelegramTools({ configured, hasToken }: { configured: boolean; hasToken: boolean }) {
  const [busy, setBusy] = useState<"" | "send" | "find">("");
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [chats, setChats] = useState<{ chatId: string; name: string }[] | null>(null);
  const [findMsg, setFindMsg] = useState("");

  async function send() {
    if (busy) return;
    setBusy("send");
    setSendMsg(null);
    try {
      const r = await sendTelegramTestAction();
      setSendMsg(r.ok ? { ok: true, text: `Delivered to the founder chat (Telegram message ${r.messageId}). Check Telegram.` } : { ok: false, text: say(r.error) });
    } catch {
      setSendMsg({ ok: false, text: "Something went wrong. Nothing was sent." });
    }
    setBusy("");
  }

  async function find() {
    if (busy) return;
    setBusy("find");
    setChats(null);
    setFindMsg("");
    try {
      const r = await findTelegramChatsAction();
      if (r.ok) {
        setChats(r.chats);
        if (r.chats.length === 0) setFindMsg("No one has written to the bot recently. Open the bot in Telegram, press Start (or send it any message), then try again.");
      } else setFindMsg(say(r.error));
    } catch {
      setFindMsg("Something went wrong.");
    }
    setBusy("");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-md border border-zinc-300 p-4">
        <h2 className="text-base font-semibold">Find your chat ID</h2>
        <p className="text-sm text-zinc-700">
          After you press <strong>Start</strong> in your bot in Telegram, this lists the accounts that recently wrote to it, so you
          can copy your own number into <code>TELEGRAM_FOUNDER_CHAT_ID</code>. Nothing is stored.
        </p>
        <button type="button" className={quietButton} disabled={!hasToken || busy !== ""} onClick={find}>
          {busy === "find" ? "Checking…" : "Find my chat ID"}
        </button>
        {!hasToken && <p className="text-sm text-zinc-600">Needs TELEGRAM_BOT_TOKEN first (step 1 and 3 below).</p>}
        {chats && chats.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {chats.map((c) => (
              <li key={c.chatId} className="rounded bg-zinc-50 px-3 py-2">
                <span className="font-mono">{c.chatId}</span> {c.name && <span className="text-zinc-600">({c.name})</span>}
              </li>
            ))}
          </ul>
        )}
        {findMsg && <p role="status" className="text-sm font-medium text-zinc-900">{findMsg}</p>}
      </div>

      <div className="space-y-2 rounded-md border border-zinc-300 p-4">
        <h2 className="text-base font-semibold">Send a test message</h2>
        <p className="text-sm text-zinc-700">Sends one short test message to the founder chat only. Nothing is sent unless you press the button.</p>
        <button type="button" className={button} disabled={!configured || busy !== ""} onClick={send}>
          {busy === "send" ? "Sending…" : "Send a test message"}
        </button>
        {!configured && <p className="text-sm text-zinc-600">Available once both settings are in place.</p>}
        {sendMsg && (
          <p role="status" className={`rounded-md p-3 text-sm font-medium ${sendMsg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
            {sendMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
