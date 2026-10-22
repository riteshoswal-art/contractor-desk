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
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2 font-medium">
        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${on ? "animate-pulse bg-green-600" : "bg-zinc-400"}`} />
        {on ? `Live: checking for new bids every ${seconds} seconds` : "Live updates paused"}
      </span>
      {checkedAt && on && <span className="text-zinc-600">last checked {checkedAt}</span>}
      <button type="button" onClick={() => setOn((x) => !x)} className="rounded-md border border-zinc-400 bg-white px-3 py-1 font-semibold">
        {on ? "Pause" : "Resume"}
      </button>
      <button type="button" onClick={() => router.refresh()} className="rounded-md border border-zinc-400 bg-white px-3 py-1 font-semibold">
        Refresh now
      </button>
    </div>
  );
}
