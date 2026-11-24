/* Original line icons for the shell (24×24, currentColor). Decorative: labels carry the names. */
const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "square", strokeLinejoin: "miter", "aria-hidden": true, focusable: false } as const;

/** PokéVault monogram: "PV" inside a cut-corner hexagon (original mark, also the favicon). */
export function Monogram({ size = 32 }: { size?: number }) {
  return <svg className="pv-monogram" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path className="pv-monogram__frame" d="M2 2H23L30 9V30H9L2 23Z" />
    <path className="pv-monogram__letters" d="M8.5 23V9H13a3.5 3.5 0 0 1 0 7H8.5M18 9l3 14 3-14" />
  </svg>;
}

export function HomeIcon() {
  return <svg {...common}><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" /></svg>;
}

export function BoxIcon() {
  return <svg {...common}><path d="M3 5h18v14H3zM9 5v14M15 5v14M3 12h18" /></svg>;
}

export function ScanIcon() {
  return <svg {...common}><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M7 12h10" /></svg>;
}

export function CardsIcon() {
  return <svg {...common}><path d="M8 3h11v15H8zM5 6v15h11" /></svg>;
}

export function UserIcon() {
  return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5" /></svg>;
}

export function ExploreIcon() {
  return <svg {...common}><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
}
