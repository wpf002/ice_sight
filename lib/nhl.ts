import { NHLGame, NHLTeam } from "@/types";

const NHL_API = "https://api-web.nhle.com/v1";

// ── Teams ──────────────────────────────────────────────────────────────────
// Pull from standings so we always get current season teams with abbreviations
export async function getTeams(): Promise<NHLTeam[]> {
  const res = await fetch(`${NHL_API}/standings/now`, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`NHL standings fetch failed: ${res.status}`);
  const data = await res.json();

  return (data.standings as Record<string, unknown>[]).map((t) => {
    const abbrev = (t.teamAbbrev as { default: string }).default;
    const place  = (t.placeName  as { default: string }).default;
    const common = (t.teamName   as { default: string }).default;
    return {
      id: abbrev,
      abbreviation: abbrev,
      name: `${place} ${common}`,
      locationName: place,
      teamName: common,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Recent games ───────────────────────────────────────────────────────────
// Fetches the last N completed games for a team using the month schedule endpoint.
// Walks back up to 2 months to fill the requested count.
export async function getRecentGames(teamAbbrev: string, count = 5): Promise<NHLGame[]> {
  const games: NHLGame[] = [];
  const today = new Date();

  for (let monthOffset = 0; monthOffset <= 2 && games.length < count; monthOffset++) {
    const d = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const res = await fetch(`${NHL_API}/club-schedule/${teamAbbrev}/month/${ym}`);
    if (!res.ok) continue;

    const data = await res.json();
    const completed: NHLGame[] = (data.games as NHLGame[])
      .filter((g) => g.gameState === "OFF")
      .reverse(); // most recent first

    games.push(...completed);
  }

  return games.slice(0, count).reverse(); // return oldest → newest
}

// ── Upcoming games ─────────────────────────────────────────────────────────
export async function getUpcomingGames(teamAbbrev: string, count = 3): Promise<NHLGame[]> {
  const res = await fetch(`${NHL_API}/club-schedule/${teamAbbrev}/week/now`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.games as NHLGame[])
    .filter((g) => g.gameState === "FUT")
    .slice(0, count);
}

// ── Format helpers ─────────────────────────────────────────────────────────
export function formatRecentGamesText(games: NHLGame[], myAbbrev: string): string {
  if (!games.length) return "No recent completed games found.";

  return games.map((g) => {
    const isHome  = g.homeTeam.abbrev === myAbbrev;
    const myScore = isHome ? (g.homeTeam.score ?? 0) : (g.awayTeam.score ?? 0);
    const opScore = isHome ? (g.awayTeam.score ?? 0) : (g.homeTeam.score ?? 0);
    const result  = myScore > opScore ? "W" : "L";
    const opp     = isHome
      ? g.awayTeam.commonName?.default ?? g.awayTeam.abbrev
      : g.homeTeam.commonName?.default ?? g.homeTeam.abbrev;
    const venue   = isHome ? "HOME" : "AWAY";
    return `${g.gameDate} [${venue}]: ${result} ${myScore}-${opScore} vs ${opp}`;
  }).join("\n");
}
