/**
 * Per-team brand colors used to re-theme the UI when "Our Team" changes.
 * `primary` drives the green-slot accent (buttons, highlights, glows);
 * `secondary` drives the gold-slot accent (VS, headers, dates).
 *
 * Colors are chosen to read well on the near-black background — dark brand
 * colors (navy/black) are nudged toward a visible mid-tone so accents don't
 * disappear. Lighter/brighter variants are derived at apply time.
 */
export interface TeamColor {
  primary: string;
  secondary: string;
}

export const TEAM_COLORS: Record<string, TeamColor> = {
  ANA: { primary: "#F47A38", secondary: "#B9975B" },
  ARI: { primary: "#A9431E", secondary: "#E2D6B5" },
  BOS: { primary: "#FFB81C", secondary: "#C0C0C0" },
  BUF: { primary: "#2D6CC0", secondary: "#FCB514" },
  CGY: { primary: "#D2001C", secondary: "#F1BE48" },
  CAR: { primary: "#CE1126", secondary: "#A2AAAD" },
  CHI: { primary: "#CF0A2C", secondary: "#FF671B" },
  COL: { primary: "#8B2942", secondary: "#3E7CB1" },
  CBJ: { primary: "#2E5BA8", secondary: "#CE1126" },
  DAL: { primary: "#006847", secondary: "#C8A84B" },
  DET: { primary: "#CE1126", secondary: "#C0C0C0" },
  EDM: { primary: "#FF4C00", secondary: "#3E6FB5" },
  FLA: { primary: "#C8102E", secondary: "#B9975B" },
  LAK: { primary: "#A2AAAD", secondary: "#E2E2E2" },
  MIN: { primary: "#2E7D5B", secondary: "#EAAA00" },
  MTL: { primary: "#AF1E2D", secondary: "#3E5BB5" },
  NSH: { primary: "#FFB81C", secondary: "#4A7AB5" },
  NJD: { primary: "#CE1126", secondary: "#C0C0C0" },
  NYI: { primary: "#1A6DC0", secondary: "#F47D30" },
  NYR: { primary: "#2153C9", secondary: "#CE1126" },
  OTT: { primary: "#C8102E", secondary: "#C2912C" },
  PHI: { primary: "#F74902", secondary: "#C0C0C0" },
  PIT: { primary: "#FCB514", secondary: "#C0C0C0" },
  SJS: { primary: "#008791", secondary: "#EA7200" },
  SEA: { primary: "#5FB6C9", secondary: "#E9072B" },
  STL: { primary: "#2A6BD4", secondary: "#FCB514" },
  TBL: { primary: "#2A5BB5", secondary: "#C0C0C0" },
  TOR: { primary: "#2A6BD4", secondary: "#C0C0C0" },
  UTA: { primary: "#6CACE4", secondary: "#B0B7BC" },
  VAN: { primary: "#2A6BD4", secondary: "#00A651" },
  VGK: { primary: "#C8A84B", secondary: "#5A6A6E" },
  WPG: { primary: "#2E5BA8", secondary: "#C8102E" },
  WSH: { primary: "#C8102E", secondary: "#3E6FB5" },
};

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
const rgbStr = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

/**
 * Apply a team's palette by overriding the accent/gold CSS custom properties
 * on :root. Falls back to Dallas if the team is unknown. Safe to call only in
 * the browser (touches document).
 */
export function applyTeamTheme(abbrev: string | undefined): void {
  if (typeof document === "undefined") return;
  const c = TEAM_COLORS[(abbrev ?? "").toUpperCase()] ?? TEAM_COLORS.DAL;
  const primary = hexToRgb(c.primary);
  const secondary = hexToRgb(c.secondary);
  const root = document.documentElement.style;

  root.setProperty("--accent",        rgbStr(primary));
  root.setProperty("--accent-light",  rgbStr(mix(primary, WHITE, 0.18)));
  root.setProperty("--accent-bright", rgbStr(mix(primary, WHITE, 0.42)));
  root.setProperty("--accent-dim",    rgba(primary, 0.18));
  root.setProperty("--accent-glow",   rgba(primary, 0.25));
  root.setProperty("--win",           rgbStr(mix(primary, WHITE, 0.18)));

  root.setProperty("--gold",          rgbStr(secondary));
  root.setProperty("--gold-dim",      rgba(secondary, 0.15));
}
