"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { pairingLinkAction } from "../builder/actions";

export type ContractorRow = { id: string; name: string; trade: string; area: string; status: string; connectedAs: string };

const quietButton =
  "rounded-full border border-[var(--line-strong)] bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-900 hover:border-[var(--ink)] disabled:opacity-60";

// A one-time Telegram connect link per registered contractor, to send to that
// contractor so their phone receives job messages. Nothing is sent from here.
export default function ContractorLinks({ rows }: { rows: ContractorRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState("");

  async function make(id: string) {
    if (busy) return;
    setBusy(id);
    setProblem("");
    setCopied(false);
    try {
      const r = await pairingLinkAction(id);
      if (r.ok) setLink({ id, url: r.url });
      else setProblem(r.error === "no_token" ? "Add TELEGRAM_BOT_TOKEN to .env.local first." : "Could not create the link. Please try again.");
    } catch {
      setProblem("Could not create the link. Please try again.");
    }
    setBusy("");
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Contractors</h2>
        <button type="button" className={quietButton} onClick={() => router.refresh()}>
          Refresh
        </button>
      </div>
      <p className="text-sm leading-6 text-zinc-600">
        Contractors who register on their phone connect Telegram themselves. For anyone else, create their link and send it to them:
        they open it and press <strong>Start</strong>. Each link works once, for 30 minutes.
      </p>
      {problem && <p role="alert" className="text-sm font-medium text-red-800">{problem}</p>}
      <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[20px] border border-[var(--line)]">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{r.name || "Name not given"}</p>
                <p className="text-sm text-zinc-600">
                  {r.trade}, {r.area} · {r.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.connectedAs ? "bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "bg-[var(--surface-2)] text-zinc-600"}`}>
                  {r.connectedAs ? `Connected (${r.connectedAs})` : "Not connected"}
                </span>
                <button type="button" className={quietButton} disabled={busy !== ""} onClick={() => make(r.id)}>
                  {busy === r.id ? "Creating…" : r.connectedAs ? "New link" : "Create link"}
                </button>
              </div>
            </div>
            {link?.id === r.id && (
              <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--surface-2)] p-2.5">
                <code className="break-all text-xs">{link.url}</code>
                <button type="button" className={quietButton} onClick={() => copy(link.url)}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
