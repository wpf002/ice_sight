import { NHLGame, NHLGoalie, NHLSkater, NHLTeam, TeamPersonnel } from "@/types";

const NHL_API   = "https://api-web.nhle.com/v1";
const NHL_STATS = "https://api.nhle.com/stats/rest/en";

function currentSeasonId(): string {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const start = month >= 10 ? year : year - 1;
  return `${start}${start + 1}`;
}

function formatToi(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
    // Guard: some API responses return the full "City Team" in teamName already
    const fullName = common.startsWith(place) ? common : `${place} ${common}`;
    return {
      id: abbrev,
      abbreviation: abbrev,
      name: fullName,
      locationName: place,
      teamName: common,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Player personnel ───────────────────────────────────────────────────────
export async function getTeamPersonnel(teamAbbrev: string): Promise<TeamPersonnel> {
  const season  = currentSeasonId();
  const abbrev  = teamAbbrev.toUpperCase();
  const cayenne = encodeURIComponent(
    `seasonId=${season} and gameTypeId=2 and teamAbbrevs="${abbrev}"`
  );

  const [skatersRes, goalieRes] = await Promise.all([
    fetch(`${NHL_STATS}/skater/summary?cayenneExp=${cayenne}&sort=points&limit=25`, { next: { revalidate: 3600 } }),
    fetch(`${NHL_STATS}/goalie/summary?cayenneExp=${cayenne}&sort=gamesStarted&limit=3`,  { next: { revalidate: 3600 } }),
  ]);

  const skatersData = skatersRes.ok ? await skatersRes.json() : { data: [] };
  const goalieData  = goalieRes.ok  ? await goalieRes.json()  : { data: [] };

  const allSkaters: NHLSkater[] = (skatersData.data as Record<string, unknown>[]).map((s) => ({
    name:                  s.skaterFullName as string,
    position:              s.positionCode as string,
    gamesPlayed:           s.gamesPlayed as number,
    goals:                 s.goals as number,
    assists:               s.assists as number,
    points:                s.points as number,
    toiPerGame:            s.timeOnIcePerGame as number,
    powerPlayPoints:       (s.powerPlayPoints as number) ?? 0,
    shorthandedToiPerGame: (s.shorthandedTimeOnIcePerGame as number) ?? 0,
  }));

  const forwards   = allSkaters.filter((s) => ["C", "L", "R"].includes(s.position)).slice(0, 5);
  const defensemen = allSkaters.filter((s) => s.position === "D").slice(0, 3);

  const raw = (goalieData.data as Record<string, unknown>[])[0] ?? null;
  const goalie: NHLGoalie | null = raw ? {
    name:                raw.goalieFullName as string,
    gamesStarted:        raw.gamesStarted as number,
    wins:                raw.wins as number,
    losses:              raw.losses as number,
    otLosses:            raw.otLosses as number,
    savePct:             raw.savePct as number,
    goalsAgainstAverage: raw.goalsAgainstAverage as number,
    shutouts:            raw.shutouts as number,
  } : null;

  return { team: abbrev, forwards, defensemen, goalie };
}

export function formatPersonnelForPrompt(p: TeamPersonnel): string {
  const fwds = p.forwards.map((s) =>
    `  ${s.name} (${s.position}) — ${s.gamesPlayed} GP, ${s.goals}G-${s.assists}A-${s.points}Pts, ${formatToi(s.toiPerGame)}/gm, ${s.powerPlayPoints} PP pts`
  ).join("\n");

  const dmen = p.defensemen.map((s) =>
    `  ${s.name} (D) — ${s.gamesPlayed} GP, ${s.goals}G-${s.assists}A-${s.points}Pts, ${formatToi(s.toiPerGame)}/gm, ${s.powerPlayPoints} PP pts`
  ).join("\n");

  const gtdr = p.goalie
    ? `  ${p.goalie.name} — ${p.goalie.gamesStarted} GS, ${p.goalie.wins}-${p.goalie.losses}-${p.goalie.otLosses} (W-L-OT), ${p.goalie.savePct.toFixed(3)} SV%, ${p.goalie.goalsAgainstAverage.toFixed(2)} GAA, ${p.goalie.shutouts} SO`
    : "  Not available";

  return `Key Personnel:
Top Forwards (by points):
${fwds}
Top Defensemen (by points):
${dmen}
Starting Goaltender:
${gtdr}`;
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

  let wins = 0, losses = 0, otl = 0;

  const lines = games.map((g) => {
    const isHome  = g.homeTeam.abbrev === myAbbrev;
    const myScore = isHome ? (g.homeTeam.score ?? 0) : (g.awayTeam.score ?? 0);
    const opScore = isHome ? (g.awayTeam.score ?? 0) : (g.homeTeam.score ?? 0);
    const opp     = isHome
      ? g.awayTeam.commonName?.default ?? g.awayTeam.abbrev
      : g.homeTeam.commonName?.default ?? g.homeTeam.abbrev;
    const venue   = isHome ? "HOME" : "AWAY";

    let result: string;
    if (myScore > opScore) {
      result = "W";
      wins++;
    } else {
      const lastPeriod = g.gameOutcome?.lastPeriodType;
      if (lastPeriod === "OT" || lastPeriod === "SO") {
        result = "OTL";
        otl++;
      } else {
        result = "L";
        losses++;
      }
    }

    return `${g.gameDate} [${venue}]: ${result} ${myScore}-${opScore} vs ${opp}`;
  });

  const record = otl > 0 ? `${wins}-${losses}-${otl} (W-L-OTL)` : `${wins}-${losses}`;
  return `Record (last ${games.length}): ${record}\n\n` + lines.join("\n");
}
