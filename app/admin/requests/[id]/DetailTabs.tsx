"use client";

import { useSearchParams } from "next/navigation";

export type DetailTab = "bids" | "matches" | "job";
const TABS: DetailTab[] = ["bids", "matches", "job"];

// The Bids / Matches / Job switch of the request page (Concept B "seg tabs").
// Every panel stays mounted (only hidden), so a link shown once or a half-typed
// reason survives switching tabs, and server actions keep working. The open tab
// lives in ?tab= so it can be linked to; switching uses the native history API,
// which does not reload the page.
export default function DetailTabs({
  back,
  head,
  intro,
  labels,
  bids,
  matches,
  job,
}: {
  back: React.ReactNode;
  head: React.ReactNode;
  intro: React.ReactNode;
  labels: Record<DetailTab, string>;
  bids: React.ReactNode;
  matches: React.ReactNode;
  job: React.ReactNode;
}) {
  const params = useSearchParams();
  const asked = params.get("tab");
  const tab: DetailTab = TABS.includes(asked as DetailTab) ? (asked as DetailTab) : "bids";

  function open(next: DetailTab) {
    const query = new URLSearchParams(params.toString());
    if (next === "bids") query.delete("tab");
    else query.set("tab", next);
    const search = query.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }

  const panels: Record<DetailTab, React.ReactNode> = { bids, matches, job };

  return (
    <>
      <div className="detail-head">
        {back}
        <div className="row between wrap" style={{ alignItems: "flex-end", gap: 16 }}>
          {head}
          <div className="seg tabs" role="tablist" aria-label="Request sections">
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`tab-${k}`}
                aria-selected={tab === k}
                aria-controls={`panel-${k}`}
                className={tab === k ? "on" : ""}
                onClick={() => open(k)}
              >
                {labels[k]}
              </button>
            ))}
          </div>
        </div>
        {intro}
      </div>
      {TABS.map((k) => (
        <div key={k} role="tabpanel" id={`panel-${k}`} aria-labelledby={`tab-${k}`} hidden={tab !== k}>
          {panels[k]}
        </div>
      ))}
    </>
  );
}
