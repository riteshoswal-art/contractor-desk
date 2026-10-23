// Small Concept B building blocks shared by every page: the icon set (the same
// line icons as the ui-demos reference) and a few presentational helpers.
// Everything is styled by app/concept-b.css.

const ICON_PATHS = {
  check: "M5 12.5l4.2 4.2L19 7",
  cal: "M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z",
  pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 18l-6-6 6-6",
  info: "M12 8h.01M11 12h1v5h1M12 21a9 9 0 100-18 9 9 0 000 18z",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  users: "M16 20v-1.5A3.5 3.5 0 0012.5 15h-5A3.5 3.5 0 004 18.5V20M10 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15.5 4.6a3.5 3.5 0 010 6.8",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18",
  scale: "M12 4v16M5 20h14M6 8l-3 6a3 3 0 006 0L6 8zm12 0l-3 6a3 3 0 006 0l-3-6zM6 8h12",
  shield: "M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z",
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h10v10H9zM5 15V5h10",
  home: "M4 11l8-7 8 7M6 9.5V20h12V9.5",
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  phone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
  chat: "M5 5h14v10H9l-4 4z",
  send: "M4 12l16-8-6 16-2-6-8-2z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ display: "inline-block", flex: "none" }}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <rect width="28" height="28" rx="8" fill="currentColor" />
      <path d="M7 19h14M9 19v-6h4v6M15 19V9h4v10" stroke="var(--logo-ink, #fff)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The faint schematic street map behind the home hero (not to scale).
export function Roads() {
  return (
    <svg className="roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <g fill="none" stroke="var(--map-road, #d9dcdb)" strokeWidth="0.6" vectorEffect="non-scaling-stroke">
        <path d="M0 52 C20 48 30 44 50 47 S80 52 100 46" />
        <path d="M8 0 C14 30 22 60 30 100" />
        <path d="M60 0 C58 30 62 60 56 100" />
        <path d="M0 28 C30 34 60 26 100 32" />
        <path d="M0 80 C30 74 70 82 100 76" />
        <path d="M85 0 C80 40 90 70 86 100" />
        <path d="M30 20 L46 46 L70 60 L92 88" />
        <path d="M14 64 L36 56 L58 36 L78 18" />
      </g>
      <path d="M0 62 C18 58 26 66 40 63 S70 54 100 60" fill="none" stroke="var(--map-river, #cfe0ea)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// "Explain on the left, the screen on the right" layout used by the
// contractor-facing pages (register, bid, review) and the builder page.
export function Stage({ explain, children }: { explain: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="device-stage">
        <div className="explain stack" style={{ ["--gap" as string]: "16px" }}>
          {explain}
        </div>
        <div className="card cb-screen">{children}</div>
      </div>
    </div>
  );
}
