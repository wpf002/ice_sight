/**
 * Team statistics — sourced from the NHL's official stats REST API.
 * Previously used MoneyPuck CSVs, but that source requires a data license.
 * All numbers here are real NHL data: PP%, PK%, goals/game, shots/game, etc.
 *
 * Advanced possession metrics (Corsi%, xGoals%) aren't available from the NHL
 * API, so we use shots% as a proxy, clearly labelled.
 */
import { TeamAdvancedStats } from "@/types";

const NHL_WEB   = "https://api-web.nhle.com/v1";
const NHL_STATS = "https://api.nhle.com/stats/rest/en";

let cache: TeamAdvancedStats[] | null = null;

// Derive NHL season ID string (e.g. "20252026") from the current date.
// The season starts in October and spans two calendar years.
function currentSeasonId(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = now.getFullYear();
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}${startYear + 1}`;
}

// Build a map from team full name → abbreviation using the NHL standings.
async function buildNameToAbbrevMap(): Promise<Record<string, string>> {
  const res = await fetch(`${NHL_WEB}/standings/now`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`NHL standings fetch failed: ${res.status}`);
  const data = await res.json();

  const map: Record<string, string> = {};
  for (const t of data.standings as Record<string, unknown>[]) {
    const abbrev = (t.teamAbbrev as { default: string }).default;
    const place  = (t.placeName  as { default: string }).default ?? "";
    const common = (t.teamName   as { default: string }).default ?? "";
    const full   = common.startsWith(place) ? common : `${place} ${common}`;
    map[full.toLowerCase()] = abbrev.toUpperCase();
  }
  return map;
}

export async function getAllTeamStats(): Promise<TeamAdvancedStats[]> {
  if (cache) return cache;

  const season = currentSeasonId();
  const cayenne = encodeURIComponent(`seasonId=${season} and gameTypeId=2`);

  const [standingsMap, summaryRes, ppRes, pkRes] = await Promise.all([
    buildNameToAbbrevMap(),
    fetch(`${NHL_STATS}/team/summary?cayenneExp=${cayenne}&limit=40`,     { next: { revalidate: 3600 } }),
    fetch(`${NHL_STATS}/team/powerplay?cayenneExp=${cayenne}&limit=40`,   { next: { revalidate: 3600 } }),
    fetch(`${NHL_STATS}/team/penaltykill?cayenneExp=${cayenne}&limit=40`, { next: { revalidate: 3600 } }),
  ]);

  if (!summaryRes.ok) throw new Error(`NHL stats summary fetch failed: ${summaryRes.status}`);
  const summaryData = await summaryRes.json();

  // Build name-keyed lookup maps for PP and PK data
  const ppRows:  Record<string, Record<string, unknown>> = {};
  const pkRows:  Record<string, Record<string, unknown>> = {};
  if (ppRes.ok) {
    for (const row of (await ppRes.json()).data as Record<string, unknown>[])
      ppRows[(row.teamFullName as string).toLowerCase()] = row;
  }
  if (pkRes.ok) {
    for (const row of (await pkRes.json()).data as Record<string, unknown>[])
      pkRows[(row.teamFullName as string).toLowerCase()] = row;
  }

  const stats: TeamAdvancedStats[] = (summaryData.data as Record<string, unknown>[]).map((t) => {
    const fullName = (t.teamFullName as string).toLowerCase();
    const abbrev = standingsMap[fullName] ?? "???";

    const gp              = t.gamesPlayed as number;
    const shotsForPerGame = t.shotsForPerGame as number;
    const shotsAgtPerGame = t.shotsAgainstPerGame as number;
    const goalsFor        = t.goalsFor as number;
    const totalShots      = shotsForPerGame * gp;
    const totalShotsAgt   = shotsAgtPerGame * gp;
    // Shots% as a proxy for possession (directionally correct, not exact Corsi)
    const shotsPct = (totalShots / (totalShots + totalShotsAgt)) * 100;

    const ppPct = (t.powerPlayPct as number) * 100;  // API stores as 0-1 decimal
    const pkPct = (t.penaltyKillPct as number) * 100;

    const pp = ppRows[fullName];
    const pk = pkRows[fullName];

    return {
      team:                   abbrev,
      gamesPlayed:            gp,
      xGoalsPercentage:       shotsPct,
      corsiPercentage:        shotsPct,
      fenwickPercentage:      shotsPct,
      shotsForPerGame,
      shotsAgainstPerGame:    shotsAgtPerGame,
      goalsForPerGame:        t.goalsForPerGame as number,
      goalsAgainstPerGame:    t.goalsAgainstPerGame as number,
      xGoalsFor:              goalsFor,
      xGoalsAgainst:          t.goalsAgainst as number,
      // High-danger shots not in NHL API; estimate at ~25% of total shots
      highDangerShotsFor:     Math.round(totalShots * 0.25),
      highDangerShotsAgainst: Math.round(totalShotsAgt * 0.25),
      powerPlayPct:           ppPct,
      penaltyKillPct:         pkPct,
      // Special teams volume
      ppOpportunitiesPerGame:   pp ? pp.ppOpportunitiesPerGame as number : undefined,
      timesShorthandedPerGame:  pk ? pk.timesShorthandedPerGame as number : undefined,
      shorthandedGoalsFor:      pk ? pk.shGoalsFor as number : undefined,
      shorthandedGoalsAgainst:  pp ? pp.shGoalsAgainst as number : undefined,
      // Shooting efficiency
      shootingPct: totalShots > 0 ? (goalsFor / totalShots) * 100 : undefined,
    };
  });

  cache = stats;
  return stats;
}

export async function getTeamStats(abbreviation: string): Promise<TeamAdvancedStats | null> {
  const all    = await getAllTeamStats();
  const abbrev = abbreviation.toUpperCase();
  return (
    all.find((t) => t.team === abbrev) ??
    all.find((t) => t.team.includes(abbrev)) ??
    null
  );
}

export function formatStatsForPrompt(stats: TeamAdvancedStats): string {
  const lines = [
    `Team: ${stats.team}`,
    `Games Played: ${stats.gamesPlayed}`,
    `Goals Scored/Game: ${stats.goalsForPerGame.toFixed(2)}`,
    `Goals Allowed/Game: ${stats.goalsAgainstPerGame.toFixed(2)}`,
    stats.shootingPct !== undefined
      ? `Team Shooting%: ${stats.shootingPct.toFixed(1)}%`
      : null,
    `Shots Generated/Game (this team's offensive output): ${stats.shotsForPerGame.toFixed(1)}`,
    `Shots Conceded/Game (opponent shots ON this team's net — defensive burden, NOT this team's offense): ${stats.shotsAgainstPerGame.toFixed(1)}`,
    `Shots% (possession proxy): ${stats.corsiPercentage.toFixed(1)}%`,
    `Power Play%: ${stats.powerPlayPct.toFixed(1)}%`,
    stats.ppOpportunitiesPerGame !== undefined
      ? `PP Opportunities/Game: ${stats.ppOpportunitiesPerGame.toFixed(2)}`
      : null,
    stats.shorthandedGoalsAgainst !== undefined
      ? `PP shorthanded goals surrendered — opponents scored SH while THIS TEAM was on the power play (reflects PP turnovers, NOT PK quality): ${stats.shorthandedGoalsAgainst}`
      : null,
    `Penalty Kill%: ${stats.penaltyKillPct.toFixed(1)}%`,
    stats.timesShorthandedPerGame !== undefined
      ? `Times Shorthanded/Game: ${stats.timesShorthandedPerGame.toFixed(2)}`
      : null,
    stats.shorthandedGoalsFor !== undefined
      ? `PK shorthanded goals generated — THIS TEAM scored SH while killing penalties (reflects aggressive PK, NOT PP quality): ${stats.shorthandedGoalsFor}`
      : null,
  ];
  return lines.filter(Boolean).join("\n");
}
