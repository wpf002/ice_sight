/**
 * Shot-quality metrics derived from the NHL's play-by-play feed
 * (api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play).
 *
 * Every shot event carries x/y ice coordinates, so we can compute REAL,
 * location-based numbers rather than the old fabricated estimates:
 *   - high-danger (slot / "home-plate") chance rates, for and against
 *   - average shot distance, for and against
 *
 * These are objective geometric measures. We deliberately do NOT compute an
 * expected-goals figure here, because a credible xG model needs fitted
 * coefficients from a licensed dataset — inventing them would be the same kind
 * of fabrication we removed. Distance + high-danger counts stand on their own.
 *
 * Coordinate system: centered at center ice, units in feet. Goal lines sit at
 * x = ±89, ice half-width is 42.5 ft. We measure each shot against the NEAREST
 * net (|x|), which is valid because virtually all shots are taken in the
 * offensive zone near the net being attacked.
 */
import { ShotQuality } from "@/types";
import { getRecentGames } from "./nhl";

const NHL_API = "https://api-web.nhle.com/v1";

// Unblocked shot attempts (Fenwick). Blocked shots are excluded because their
// recorded coordinates are the block location, not the shooter's.
const SHOT_EVENTS = new Set(["shot-on-goal", "goal", "missed-shot"]);

// Distance from the nearest net, in feet.
function shotDistance(x: number, y: number): number {
  return Math.hypot(89 - Math.abs(x), Math.abs(y));
}

// Approximate high-danger inner-slot region: within ~25 ft of the net, between
// the faceoff dots laterally, and in front of (not behind) the goal line. This
// tracks the "home-plate" scoring area without claiming to match any specific
// proprietary high-danger model.
function isHighDanger(x: number, y: number): boolean {
  const ax = 89 - Math.abs(x); // feet in front of the goal line
  const ay = Math.abs(y);
  return ax >= -3 && ay <= 22 && shotDistance(x, y) <= 25;
}

export async function getShotQuality(teamAbbrev: string, count = 10): Promise<ShotQuality> {
  const abbrev = teamAbbrev.toUpperCase();
  const games = await getRecentGames(abbrev, count); // completed games, oldest → newest

  const feeds = await Promise.all(
    games.map((g) =>
      fetch(`${NHL_API}/gamecenter/${g.id}/play-by-play`, { next: { revalidate: 86400 } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );

  let gamesAnalyzed = 0;
  let hdFor = 0, hdAgainst = 0;
  let shotsFor = 0, shotsAgainst = 0;
  let distForSum = 0, distAgainstSum = 0;

  for (const j of feeds) {
    if (!j) continue;
    const home = j.homeTeam ?? {};
    const away = j.awayTeam ?? {};
    const myId =
      home.abbrev === abbrev ? home.id :
      away.abbrev === abbrev ? away.id : null;
    if (myId == null) continue;
    gamesAnalyzed++;

    for (const p of (j.plays ?? []) as Record<string, unknown>[]) {
      if (!SHOT_EVENTS.has(p.typeDescKey as string)) continue;
      const d = (p.details ?? {}) as Record<string, unknown>;
      const x = d.xCoord, y = d.yCoord;
      if (typeof x !== "number" || typeof y !== "number") continue;

      const forUs = d.eventOwnerTeamId === myId;
      const hd = isHighDanger(x, y);
      const dist = shotDistance(x, y);

      if (forUs) { shotsFor++; distForSum += dist; if (hd) hdFor++; }
      else       { shotsAgainst++; distAgainstSum += dist; if (hd) hdAgainst++; }
    }
  }

  const perGame = (n: number) => (gamesAnalyzed > 0 ? n / gamesAnalyzed : 0);

  return {
    gamesAnalyzed,
    highDangerForPerGame:     perGame(hdFor),
    highDangerAgainstPerGame: perGame(hdAgainst),
    highDangerSharePct:       (hdFor + hdAgainst) > 0 ? (hdFor / (hdFor + hdAgainst)) * 100 : 0,
    avgShotDistanceFor:       shotsFor > 0 ? distForSum / shotsFor : 0,
    avgShotDistanceAgainst:   shotsAgainst > 0 ? distAgainstSum / shotsAgainst : 0,
  };
}

export function formatShotQualityForPrompt(sq: ShotQuality): string {
  if (sq.gamesAnalyzed === 0) return "Shot Quality: not available";
  return [
    `Shot Quality (last ${sq.gamesAnalyzed} games, from NHL shot coordinates):`,
    `High-danger (slot) chances generated/game: ${sq.highDangerForPerGame.toFixed(1)}`,
    `High-danger (slot) chances conceded/game: ${sq.highDangerAgainstPerGame.toFixed(1)}`,
    `High-danger chance share: ${sq.highDangerSharePct.toFixed(1)}% (above 50% = generates more quality than it allows)`,
    `Avg shot distance generated: ${sq.avgShotDistanceFor.toFixed(1)} ft (lower = closer looks)`,
    `Avg shot distance conceded: ${sq.avgShotDistanceAgainst.toFixed(1)} ft (higher = opponents pushed to the perimeter)`,
  ].join("\n");
}
