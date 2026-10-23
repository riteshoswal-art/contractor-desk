"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUNE_AREAS, TRADES } from "@/lib/registration";
import { Icon } from "./ui";

// The Concept B search bar on the home page. It does not search anything by
// itself: it opens "Raise a request" (`target`) with the ticket's trade, locality and
// start date already filled in.
export default function HomeSearch({ today, target }: { today: string; target: string }) {
  const router = useRouter();
  const [trade, setTrade] = useState<string>("Plumbing");
  const [area, setArea] = useState<string>("Baner");
  const [start, setStart] = useState(today);

  return (
    <form
      className="searchbar"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new URLSearchParams({ trade, area, start });
        router.push(`${target}?${q.toString()}`);
      }}
    >
      <label className="sb-seg">
        <span className="sb-label">Trade needed</span>
        <select className="sb-input" value={trade} onChange={(e) => setTrade(e.target.value)}>
          {TRADES.filter((t) => t !== "Other").map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="sb-seg">
        <span className="sb-label">Site locality</span>
        <select className="sb-input" value={area} onChange={(e) => setArea(e.target.value)}>
          {PUNE_AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="sb-seg">
        <span className="sb-label">Needed from</span>
        <input className="sb-input" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <button className="btn btn-primary sb-go" type="submit">
        <Icon name="arrow" />
        <span>Raise request</span>
      </button>
    </form>
  );
}
