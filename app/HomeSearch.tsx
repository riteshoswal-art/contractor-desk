"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUNE_AREAS, TRADES } from "@/lib/registration";
import { Icon } from "./ui";

// The white pill search bar on the home page. It does not search anything by
// itself: it opens "Raise a request" (`target`) with the ticket's trade,
// locality and start date already filled in.
export default function HomeSearch({ today, target }: { today: string; target: string }) {
  const router = useRouter();
  const [trade, setTrade] = useState<string>("Plumbing");
  const [area, setArea] = useState<string>("Baner");
  const [start, setStart] = useState(today);

  return (
    <form
      className="mk-search"
      aria-label="Find a contractor"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new URLSearchParams({ trade, area, start });
        router.push(`${target}?${q.toString()}`);
      }}
    >
      <label className="mk-seg">
        <Icon name="hardhat" size={20} />
        <span className="mk-seg-txt">
          <span className="mk-seg-label">Trade needed</span>
          <select className="mk-seg-input" value={trade} onChange={(e) => setTrade(e.target.value)}>
            {TRADES.filter((t) => t !== "Other").map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </span>
      </label>
      <label className="mk-seg">
        <Icon name="pin" size={20} />
        <span className="mk-seg-txt">
          <span className="mk-seg-label">Site locality</span>
          <select className="mk-seg-input" value={area} onChange={(e) => setArea(e.target.value)}>
            {PUNE_AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </span>
      </label>
      <label className="mk-seg">
        <Icon name="calendar" size={20} />
        <span className="mk-seg-txt">
          <span className="mk-seg-label">Needed from</span>
          <input className="mk-seg-input" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
        </span>
      </label>
      <button className="btn btn-gold" type="submit">
        <Icon name="search" size={16} />
        <span>Find karigars</span>
      </button>
    </form>
  );
}
