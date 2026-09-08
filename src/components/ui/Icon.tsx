/**
 * Monochrome line icons for the chrome. The logo is pure black and white, so the
 * navigation uses stroked shapes in `currentColor` rather than emoji — colour in
 * this app is reserved for money (green cash, blue card, red cost, amber credit).
 */

export type IconName =
  | "shield"
  | "chart-bar"
  | "chart-line"
  | "receipt"
  | "banknote"
  | "hand-coins"
  | "wallet"
  | "calendar"
  | "scissors"
  | "users"
  | "box"
  | "truck"
  | "tray-up"
  | "clipboard-check"
  | "cog"
  | "card"
  | "plus"
  | "list"
  | "drawer"
  | "pie";

const PATHS: Record<IconName, React.ReactNode> = {
  shield: <path d="M12 3l7 3v6c0 4-3 7.2-7 9-4-1.8-7-5-7-9V6l7-3z" />,
  "chart-bar": (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-7M12 20V6M17 20v-10" />
    </>
  ),
  "chart-line": (
    <>
      <path d="M4 20h16" />
      <path d="M4 15l5-5 3 3 5-6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  banknote: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
    </>
  ),
  "hand-coins": (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M4 21v-2a4 4 0 014-4h2" />
      <path d="M14 14h6M17 11v6" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M16 12h3" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <path d="M8 16.5L19 5M8 7.5L19 19" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20v-1.5A4.5 4.5 0 017.5 14h3A4.5 4.5 0 0115 18.5V20" />
      <path d="M17 11a2.6 2.6 0 100-5.2M19 20v-1a3.8 3.8 0 00-2-3.3" />
    </>
  ),
  box: (
    <>
      <path d="M3 8l9-4 9 4v8l-9 4-9-4V8z" />
      <path d="M3 8l9 4 9-4M12 12v8" />
    </>
  ),
  truck: (
    <>
      <path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </>
  ),
  "tray-up": (
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </>
  ),
  "clipboard-check": (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 13l2 2 4-4" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.5 7.5l1.7 1M17.8 15.5l1.7 1M4.5 16.5l1.7-1M17.8 8.5l1.7-1" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  drawer: (
    <>
      <rect x="3" y="8" width="18" height="11" rx="2" />
      <path d="M3 13h18M10 5h4l1 3H9l1-3z" />
    </>
  ),
  pie: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v8h8" />
    </>
  ),
};

export function Icon({
  name,
  className = "w-[18px] h-[18px]",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
