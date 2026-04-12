import { TeamAdvancedStats } from "@/types";

const SEASON = "2023-2024";
const CSV_URL = `https://moneypuck.com/moneypuck/playerData/seasonSummary/${SEASON}/regular/teams.csv`;

let cache: TeamAdvancedStats[] | null = null;

// ── Column alias map ───────────────────────────────────────────────────────
// MoneyPuck changes column names between seasons. We try multiple candidates
// and take the first match found in the actual header row.
const COL = {
  team:               ["team"],
  gamesPlayed:        ["games_played", "gamesPlayed", "GP"],
  xGoalsPct:          ["xGoalsPercentage", "xGF%", "xGoals%"],
  corsiPct:           ["corsiPercentage", "CF%", "Corsi%"],
  fenwickPct:         ["fenwickPercentage", "FF%", "Fenwick%"],
  shotsFor:           ["shotsOnGoalFor", "SF", "shotsFor"],
  shotsAgainst:       ["shotsOnGoalAgainst", "SA", "shotsAgainst"],
  goalsFor:           ["goalsFor", "GF"],
  goalsAgainst:       ["goalsAgainst", "GA"],
  xGoalsFor:          ["xGoalsFor", "xGF"],
  xGoalsAgainst:      ["xGoalsAgainst", "xGA"],
  hdShotsFor:         ["highDangerShotsFor", "HDSF"],
  hdShotsAgainst:     ["highDangerShotsAgainst", "HDSA"],
  ppGoalsFor:         ["powerPlayGoalsFor", "PPG", "ppGoalsFor"],
  ppOppsFor:          ["powerPlayOpportunitiesFor", "PPO", "ppOppsFor"],
  ppGoalsAgainst:     ["powerPlayGoalsAgainst", "PPGA"],
  pkOppsAgainst:      ["penaltyKillOpportunitiesAgainst", "PKO", "pkOppsAgainst"],
};

function buildIndexMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [key, candidates] of Object.entries(COL)) {
    for (const c of candidates) {
      const i = headers.findIndex((h) => h.trim() === c);
      if (i !== -1) { map[key] = i; break; }
    }
  }
  return map;
}

function safeFloat(cols: string[], idx: number | undefined): number {
  if (idx === undefined || idx < 0) return 0;
  return parseFloat(cols[idx] ?? "0") || 0;
}

function safeInt(cols: string[], idx: number | undefined): number {
  if (idx === undefined || idx < 0) return 0;
  return parseInt(cols[idx] ?? "0") || 0;
}

export async function getAllTeamStats(): Promise<TeamAdvancedStats[]> {
  if (cache) return cache;

  const res = await fetch(CSV_URL, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`MoneyPuck fetch failed: ${res.status}`);

  const csv   = await res.text();
  const lines = csv.trim().split("\n");
  if (lines.length < 2) throw new Error("MoneyPuck CSV empty");

  const headers = lines[0].split(",");
  const idx     = buildIndexMap(headers);

  const stats: TeamAdvancedStats[] = lines.slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const cols = line.split(",");
      const gp   = safeInt(cols, idx.gamesPlayed) || 1;

      const ppGoalsFor    = safeFloat(cols, idx.ppGoalsFor);
      const ppOppsFor     = safeFloat(cols, idx.ppOppsFor) || 1;
      const ppGoalsAgainst = safeFloat(cols, idx.ppGoalsAgainst);
      const pkOppsAgainst  = safeFloat(cols, idx.pkOppsAgainst) || 1;

      // xGoals% from MoneyPuck is already a 0–1 decimal; multiply by 100
      const xGPct = safeFloat(cols, idx.xGoalsPct);
      const cPct  = safeFloat(cols, idx.corsiPct);
      const fPct  = safeFloat(cols, idx.fenwickPct);

      return {
        team:                  cols[idx.team ?? 0]?.trim() ?? "???",
        gamesPlayed:           gp,
        xGoalsPercentage:      xGPct < 2 ? xGPct * 100 : xGPct,   // normalise if decimal
        corsiPercentage:       cPct  < 2 ? cPct  * 100 : cPct,
        fenwickPercentage:     fPct  < 2 ? fPct  * 100 : fPct,
        shotsForPerGame:       safeFloat(cols, idx.shotsFor)    / gp,
        shotsAgainstPerGame:   safeFloat(cols, idx.shotsAgainst) / gp,
        goalsForPerGame:       safeFloat(cols, idx.goalsFor)    / gp,
        goalsAgainstPerGame:   safeFloat(cols, idx.goalsAgainst) / gp,
        xGoalsFor:             safeFloat(cols, idx.xGoalsFor),
        xGoalsAgainst:         safeFloat(cols, idx.xGoalsAgainst),
        highDangerShotsFor:    safeFloat(cols, idx.hdShotsFor),
        highDangerShotsAgainst: safeFloat(cols, idx.hdShotsAgainst),
        powerPlayPct:          (ppGoalsFor    / ppOppsFor)    * 100,
        penaltyKillPct:        100 - (ppGoalsAgainst / pkOppsAgainst) * 100,
      };
    });

  cache = stats;
  return stats;
}

export async function getTeamStats(abbreviation: string): Promise<TeamAdvancedStats | null> {
  const all = await getAllTeamStats();
  const abbrev = abbreviation.toUpperCase();
  return (
    all.find((t) => t.team.toUpperCase() === abbrev) ??
    all.find((t) => t.team.toUpperCase().includes(abbrev)) ??
    null
  );
}

export function formatStatsForPrompt(stats: TeamAdvancedStats): string {
  return `Team: ${stats.team}
Games Played: ${stats.gamesPlayed}
xGoals%: ${stats.xGoalsPercentage.toFixed(1)}%
Corsi%: ${stats.corsiPercentage.toFixed(1)}%
Fenwick%: ${stats.fenwickPercentage.toFixed(1)}%
Goals For/Game: ${stats.goalsForPerGame.toFixed(2)}
Goals Against/Game: ${stats.goalsAgainstPerGame.toFixed(2)}
xGoals For (season): ${stats.xGoalsFor.toFixed(1)}
xGoals Against (season): ${stats.xGoalsAgainst.toFixed(1)}
High Danger Shots For (season): ${stats.highDangerShotsFor.toFixed(0)}
High Danger Shots Against (season): ${stats.highDangerShotsAgainst.toFixed(0)}
Power Play%: ${stats.powerPlayPct.toFixed(1)}%
Penalty Kill%: ${stats.penaltyKillPct.toFixed(1)}%`;
}
