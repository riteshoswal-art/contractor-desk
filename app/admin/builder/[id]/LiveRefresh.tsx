"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Keeps the ticket view current during the live demo: every few seconds it asks
// the server for the latest page data (bids, alerts, connections). It only
// READS: nothing is ever sent because of it. It pauses while the tab is hidden
// and can be switched off.
export default function LiveRefresh({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [checkedAt, setCheckedAt] = useState("");

  useEffect(() => {
    if (!on) return;
    const tick = () => {
      if (document.hidden) return;
      router.refresh();
      setCheckedAt(new Date().toLocaleTimeString("en-IN", { hour12: false }));
    };
    const timer = setInterval(tick, seconds * 1000);
    return () => clearInterval(timer);
  }, [on, seconds, router]);

  return (
    <div className="card flat tint row wrap small" style={{ padding: "8px 8px 8px 16px", gap: 10, borderRadius: "var(--radius-md)" }}>
      <span className="row grow" style={{ gap: 8, fontWeight: 600 }}>
        <span
          aria-hidden="true"
          className={on ? "animate-pulse" : undefined}
          style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", flex: "none", background: on ? "var(--ok-ink)" : "var(--line-strong)" }}
        />
        {on ? `Live: checking for new bids every ${seconds} seconds` : "Live updates paused"}
        {checkedAt && on && <span className="muted" style={{ fontWeight: 400 }}>last checked {checkedAt}</span>}
      </span>
      <button type="button" onClick={() => setOn((x) => !x)} className="btn btn-quiet">
        {on ? "Pause" : "Resume"}
      </button>
      <button type="button" onClick={() => router.refresh()} className="btn btn-ghost" style={{ minHeight: 36, background: "var(--surface)" }}>
        Refresh now
      </button>
    </div>
  );
}
