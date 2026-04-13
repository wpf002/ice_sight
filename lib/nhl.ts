import { NHLGame, NHLGoalie, NHLSkater, NHLTeam, TeamFaceoffStats, SkaterFaceoff, TeamPersonnel, HeadToHeadRecord } from "@/types";

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
  const season   = currentSeasonId();
  const abbrev   = teamAbbrev.toUpperCase();
  const cayenne  = encodeURIComponent(
    `seasonId=${season} and gameTypeId=2 and teamAbbrevs="${abbrev}"`
  );
  const sortDesc = encodeURIComponent(JSON.stringify([{ property: "points", direction: "DESC" }]));

  const goalieSort = encodeURIComponent(JSON.stringify([{ property: "gamesStarted", direction: "DESC" }]));

  const [skatersRes, goalieRes, goalieStrengthRes, goalieAdvancedRes] = await Promise.all([
    fetch(`${NHL_STATS}/skater/summary?cayenneExp=${cayenne}&sort=${sortDesc}&limit=25`,          { next: { revalidate: 3600 } }),
    fetch(`${NHL_STATS}/goalie/summary?cayenneExp=${cayenne}&sort=${goalieSort}&limit=3`,         { next: { revalidate: 3600 } }),
    fetch(`${NHL_STATS}/goalie/savesByStrength?cayenneExp=${cayenne}&sort=${goalieSort}&limit=3`, { next: { revalidate: 3600 } }),
    fetch(`${NHL_STATS}/goalie/advanced?cayenneExp=${cayenne}&sort=${goalieSort}&limit=3`,        { next: { revalidate: 3600 } }),
  ]);

  const skatersData         = skatersRes.ok          ? await skatersRes.json()         : { data: [] };
  const goalieData          = goalieRes.ok            ? await goalieRes.json()          : { data: [] };
  const goalieStrengthData  = goalieStrengthRes.ok    ? await goalieStrengthRes.json()  : { data: [] };
  const goalieAdvancedData  = goalieAdvancedRes.ok    ? await goalieAdvancedRes.json()  : { data: [] };

  // Build playerId-keyed lookup for enrichment data
  const strengthByPlayer: Record<number, Record<string, unknown>> = {};
  for (const row of goalieStrengthData.data as Record<string, unknown>[])
    strengthByPlayer[row.playerId as number] = row;

  const advancedByPlayer: Record<number, Record<string, unknown>> = {};
  for (const row of goalieAdvancedData.data as Record<string, unknown>[])
    advancedByPlayer[row.playerId as number] = row;

  const allSkaters: NHLSkater[] = (skatersData.data as Record<string, unknown>[]).map((s) => {
    const gp   = s.gamesPlayed as number;
    const shots = s.shots as number ?? 0;
    return {
      name:            s.skaterFullName as string,
      position:        s.positionCode as string,
      gamesPlayed:     gp,
      goals:           s.goals as number,
      assists:         s.assists as number,
      points:          s.points as number,
      toiPerGame:      s.timeOnIcePerGame as number,
      powerPlayPoints: (s.ppPoints as number) ?? 0,
      evPoints:        (s.evPoints as number) ?? 0,
      plusMinus:       (s.plusMinus as number) ?? 0,
      shootingPct:     (s.shootingPct as number) ?? 0,
      shotsPerGame:    gp > 0 ? shots / gp : 0,
    };
  });

  const forwards   = allSkaters.filter((s) => ["C", "L", "R"].includes(s.position)).slice(0, 5);
  const defensemen = allSkaters.filter((s) => s.position === "D").slice(0, 3);

  // Build base goalie from summary, then enrich with situational stats and recent form
  const raw = (goalieData.data as Record<string, unknown>[])[0] ?? null;
  let goalie: NHLGoalie | null = null;

  if (raw) {
    const playerId = raw.playerId as number;
    const str      = strengthByPlayer[playerId];
    const adv      = advancedByPlayer[playerId];

    goalie = {
      name:                raw.goalieFullName as string,
      gamesStarted:        raw.gamesStarted as number,
      wins:                raw.wins as number,
      losses:              raw.losses as number,
      otLosses:            raw.otLosses as number,
      savePct:             raw.savePct as number,
      goalsAgainstAverage: raw.goalsAgainstAverage as number,
      shutouts:            raw.shutouts as number,
      evSavePct:           str ? str.evSavePct as number : undefined,
      ppSavePct:           str ? str.ppSavePct as number : undefined,
      qualityStartPct:     adv ? adv.qualityStartsPct as number : undefined,
    };

    // Fetch last-10 starts for recent form + back-to-back detection
    try {
      const logRes = await fetch(
        `${NHL_API}/player/${playerId}/game-log/${season}/2`,
        { next: { revalidate: 3600 } }
      );
      if (logRes.ok) {
        const logData = await logRes.json();
        const starts = (logData.gameLog as Record<string, unknown>[])
          .filter((g) => (g.gamesStarted as number) === 1)
          .slice(0, 10);

        if (starts.length > 0) {
          const rfWins     = starts.filter((g) => g.decision === "W").length;
          const rfLosses   = starts.filter((g) => g.decision === "L").length;
          const rfOtLosses = starts.filter((g) => g.decision === "O").length;
          const totalSaves = starts.reduce((n, g) => n + ((g.shotsAgainst as number) - (g.goalsAgainst as number)), 0);
          const totalShots = starts.reduce((n, g) => n + (g.shotsAgainst as number), 0);
          const totalGA    = starts.reduce((n, g) => n + (g.goalsAgainst as number), 0);

          goalie.recentForm = {
            games:               starts.length,
            wins:                rfWins,
            losses:              rfLosses,
            otLosses:            rfOtLosses,
            savePct:             totalShots > 0 ? totalSaves / totalShots : 0,
            goalsAgainstAverage: totalGA / starts.length,
          };

          // Back-to-back detection: did the goalie start yesterday?
          const mostRecentStart = starts[0];
          if (mostRecentStart?.gameDate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yyyymmdd = yesterday.toISOString().split("T")[0];
            goalie.playedLastNight = (mostRecentStart.gameDate as string) === yyyymmdd;
          }
        }
      }
    } catch {
      // recent form is best-effort — don't fail the whole request
    }
  }

  return { team: abbrev, forwards, defensemen, goalie };
}

export function formatPersonnelForPrompt(p: TeamPersonnel): string {
  const formatSkater = (s: NHLSkater): string => {
    const base    = `${s.goals}G-${s.assists}A-${s.points}Pts`;
    const special = `${s.evPoints} EV pts, ${s.powerPlayPoints} PP pts`;
    const eff     = `${(s.shootingPct * 100).toFixed(1)}% SH, ${s.shotsPerGame.toFixed(1)} shots/gm`;
    return `  ${s.name} (${s.position}) — ${s.gamesPlayed} GP, ${base} | ${special} | +/- ${s.plusMinus > 0 ? "+" : ""}${s.plusMinus} | ${formatToi(s.toiPerGame)}/gm | ${eff}`;
  };

  const fwds = p.forwards.map(formatSkater).join("\n");
  const dmen = p.defensemen.map(formatSkater).join("\n");

  let gtdr = "  Not available";
  if (p.goalie) {
    const g = p.goalie;
    const record  = `${g.wins}-${g.losses}-${g.otLosses} (W-L-OT)`;
    const overall = `${g.savePct.toFixed(3)} SV%, ${g.goalsAgainstAverage.toFixed(2)} GAA, ${g.shutouts} SO`;
    const situational = (g.evSavePct !== undefined || g.ppSavePct !== undefined || g.qualityStartPct !== undefined)
      ? "\n    " + [
          g.evSavePct       !== undefined ? `5v5 SV%: ${g.evSavePct.toFixed(3)}`             : null,
          g.ppSavePct       !== undefined ? `PP-against SV%: ${g.ppSavePct.toFixed(3)}`      : null,
          g.qualityStartPct !== undefined ? `QS%: ${(g.qualityStartPct * 100).toFixed(1)}%`  : null,
        ].filter(Boolean).join(" | ")
      : "";
    const recent = (() => {
      if (!g.recentForm) return "";
      const rf = g.recentForm;
      const decisions = rf.wins + rf.losses + rf.otLosses;
      // Only use "Last N" label when W+L+OT = N (some starts have no decision)
      const label = decisions === rf.games
        ? `Last ${rf.games}`
        : `Last ${decisions} decisions (${rf.games} starts)`;
      return `\n    ${label}: ${rf.wins}W-${rf.losses}L-${rf.otLosses}OT, ${rf.savePct.toFixed(3)} SV%, ${rf.goalsAgainstAverage.toFixed(2)} GAA`;
    })();
    const b2b = g.playedLastNight ? "\n    *** BACK-TO-BACK: Started last night ***" : "";
    gtdr = `  ${g.name} — ${g.gamesStarted} GS, ${record}, ${overall}${situational}${recent}${b2b}`;
  }

  return `Key Personnel:
Top Forwards (by points):
${fwds}
Top Defensemen (by points):
${dmen}
Starting Goaltender:
${gtdr}`;
}

// ── Face-off stats ─────────────────────────────────────────────────────────
export async function getTeamFaceoffStats(teamAbbrev: string): Promise<TeamFaceoffStats> {
  const season  = currentSeasonId();
  const abbrev  = teamAbbrev.toUpperCase();
  const cayenne = encodeURIComponent(`seasonId=${season} and gameTypeId=2`);
  const skaterCayenne = encodeURIComponent(
    `seasonId=${season} and gameTypeId=2 and teamAbbrevs="${abbrev}"`
  );
  const sortByVolume = encodeURIComponent(
    JSON.stringify([{ property: "totalFaceoffs", direction: "DESC" }])
  );

  const [teamRes, skaterRes] = await Promise.all([
    fetch(`${NHL_STATS}/team/faceoffwins?cayenneExp=${cayenne}&limit=40`, { next: { revalidate: 3600 } }),
    fetch(`${NHL_STATS}/skater/faceoffwins?cayenneExp=${skaterCayenne}&sort=${sortByVolume}&limit=5`, { next: { revalidate: 3600 } }),
  ]);

  // Build name→abbrev map to identify correct team row
  const teams = await getTeams();
  const nameToAbbrev: Record<string, string> = {};
  for (const t of teams) nameToAbbrev[t.name.toLowerCase()] = t.abbreviation;

  const teamData   = teamRes.ok   ? (await teamRes.json()).data   as Record<string, unknown>[] : [];
  const skaterData = skaterRes.ok ? (await skaterRes.json()).data as Record<string, unknown>[] : [];

  // Match team row by full name
  const row = teamData.find((t) => {
    const fullName = (t.teamFullName as string).toLowerCase();
    return nameToAbbrev[fullName] === abbrev;
  });

  const safePct = (wins: unknown, total: unknown): number => {
    const w = wins as number;
    const t = total as number;
    return t > 0 ? w / t : 0;
  };

  const topCenters: SkaterFaceoff[] = skaterData
    .filter((s) => (s.positionCode as string) === "C")
    .slice(0, 3)
    .map((s) => ({
      name:          s.skaterFullName as string,
      totalFaceoffs: s.totalFaceoffs as number,
      overallPct:    s.faceoffWinPct as number,
      dzPct:         safePct(s.defensiveZoneFaceoffWins, s.defensiveZoneFaceoffs),
      ozPct:         safePct(s.offensiveZoneFaceoffWins, s.offensiveZoneFaceoffs),
    }));

  if (!row) {
    return { team: abbrev, overallPct: 0, ozPct: 0, dzPct: 0, nzPct: 0, ppPct: 0, pkPct: 0, topCenters };
  }

  return {
    team:       abbrev,
    overallPct: row.faceoffWinPct as number,
    ozPct:      safePct(row.offensiveZoneFaceoffWins, row.offensiveZoneFaceoffs),
    dzPct:      safePct(row.defensiveZoneFaceoffWins, row.defensiveZoneFaceoffs),
    nzPct:      safePct(row.neutralZoneFaceoffWins,   row.neutralZoneFaceoffs),
    ppPct:      safePct(row.ppFaceoffsWon,            row.ppFaceoffs),
    pkPct:      safePct(row.shFaceoffsWon,            row.shFaceoffs),
    topCenters,
  };
}

export function formatFaceoffForPrompt(f: TeamFaceoffStats): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const centers = f.topCenters.length > 0
    ? f.topCenters.map((c) =>
        `  ${c.name} — ${c.totalFaceoffs} FO, ${pct(c.overallPct)} overall | DZ: ${pct(c.dzPct)} | OZ: ${pct(c.ozPct)}`
      ).join("\n")
    : "  No center data available";

  return `Face-off Win%: ${pct(f.overallPct)} overall | OZ: ${pct(f.ozPct)} | DZ: ${pct(f.dzPct)} | NZ: ${pct(f.nzPct)} | PP: ${pct(f.ppPct)} | PK: ${pct(f.pkPct)}
Key Centers (by volume):
${centers}`;
}

// ── Recent games ───────────────────────────────────────────────────────────
// Fetches the last N completed games for a team using the month schedule endpoint.
// Walks back up to 2 months to fill the requested count.
export async function getRecentGames(teamAbbrev: string, count = 10): Promise<NHLGame[]> {
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

// ── Head-to-head season series ─────────────────────────────────────────────
export async function getHeadToHead(
  myAbbrev: string,
  oppAbbrev: string
): Promise<HeadToHeadRecord> {
  const my  = myAbbrev.toUpperCase();
  const opp = oppAbbrev.toUpperCase();

  // Build list of all months in the current NHL season (Oct → now)
  const today = new Date();
  const curMonth = today.getMonth() + 1;
  const curYear  = today.getFullYear();
  const seasonStartYear = curMonth >= 10 ? curYear : curYear - 1;

  const months: string[] = [];
  let y = seasonStartYear, m = 10;
  while (y < curYear || (y === curYear && m <= curMonth)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  // Fetch all months in parallel (Next.js caches each independently)
  const results = await Promise.all(
    months.map((ym) =>
      fetch(`${NHL_API}/club-schedule/${my}/month/${ym}`, { next: { revalidate: 3600 } })
        .then((r) => (r.ok ? r.json() : { games: [] }))
        .catch(() => ({ games: [] }))
    )
  );

  // Collect completed games vs opponent, sorted oldest → newest
  const matchGames: NHLGame[] = results
    .flatMap((data) => (data.games as NHLGame[] ?? []))
    .filter((g) =>
      g.gameState === "OFF" &&
      (g.homeTeam.abbrev === opp || g.awayTeam.abbrev === opp)
    )
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

  let wins = 0, losses = 0, otLosses = 0;
  for (const g of matchGames) {
    const isHome  = g.homeTeam.abbrev === my;
    const myScore = isHome ? (g.homeTeam.score ?? 0) : (g.awayTeam.score ?? 0);
    const opScore = isHome ? (g.awayTeam.score ?? 0) : (g.homeTeam.score ?? 0);
    if (myScore > opScore) wins++;
    else if (g.gameOutcome?.lastPeriodType === "OT" || g.gameOutcome?.lastPeriodType === "SO") otLosses++;
    else losses++;
  }

  let lastMeeting: HeadToHeadRecord["lastMeeting"];
  if (matchGames.length > 0) {
    const last    = matchGames[matchGames.length - 1];
    const isHome  = last.homeTeam.abbrev === my;
    const myScore = isHome ? (last.homeTeam.score ?? 0) : (last.awayTeam.score ?? 0);
    const opScore = isHome ? (last.awayTeam.score ?? 0) : (last.homeTeam.score ?? 0);
    const outcome = myScore > opScore
      ? "W"
      : (last.gameOutcome?.lastPeriodType === "OT" || last.gameOutcome?.lastPeriodType === "SO" ? "OTL" : "L");
    lastMeeting = {
      date:   last.gameDate,
      result: `${outcome} ${myScore}-${opScore} (${isHome ? "HOME" : "AWAY"})`,
    };
  }

  return { wins, losses, otLosses, lastMeeting };
}

export function formatHeadToHeadForPrompt(h2h: HeadToHeadRecord, myAbbrev: string, oppAbbrev: string): string {
  const total = h2h.wins + h2h.losses + h2h.otLosses;
  if (total === 0) return `Season Series vs ${oppAbbrev}: No meetings yet`;

  const record = `${h2h.wins}-${h2h.losses}-${h2h.otLosses} (W-L-OTL)`;
  const last   = h2h.lastMeeting
    ? `  Last meeting: ${h2h.lastMeeting.date} — ${h2h.lastMeeting.result}`
    : "";
  return `Season Series (${myAbbrev} vs ${oppAbbrev}): ${record}\n${last}`.trim();
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

  const classifyGame = (g: NHLGame): { result: string; w: number; l: number; otl: number } => {
    const isHome  = g.homeTeam.abbrev === myAbbrev;
    const myScore = isHome ? (g.homeTeam.score ?? 0) : (g.awayTeam.score ?? 0);
    const opScore = isHome ? (g.awayTeam.score ?? 0) : (g.homeTeam.score ?? 0);
    if (myScore > opScore) return { result: "W", w: 1, l: 0, otl: 0 };
    const lastPeriod = g.gameOutcome?.lastPeriodType;
    if (lastPeriod === "OT" || lastPeriod === "SO") return { result: "OTL", w: 0, l: 0, otl: 1 };
    return { result: "L", w: 0, l: 1, otl: 0 };
  };

  const lines = games.map((g) => {
    const isHome  = g.homeTeam.abbrev === myAbbrev;
    const myScore = isHome ? (g.homeTeam.score ?? 0) : (g.awayTeam.score ?? 0);
    const opScore = isHome ? (g.awayTeam.score ?? 0) : (g.homeTeam.score ?? 0);
    const opp     = isHome
      ? g.awayTeam.commonName?.default ?? g.awayTeam.abbrev
      : g.homeTeam.commonName?.default ?? g.homeTeam.abbrev;
    const venue   = isHome ? "HOME" : "AWAY";
    const { result } = classifyGame(g);
    return `${g.gameDate} [${venue}]: ${result} ${myScore}-${opScore} vs ${opp}`;
  });

  // Compute last-10 and last-5 records
  const summarize = (gs: NHLGame[]) => {
    let w = 0, l = 0, otl = 0;
    for (const g of gs) { const c = classifyGame(g); w += c.w; l += c.l; otl += c.otl; }
    return otl > 0 ? `${w}-${l}-${otl} (W-L-OTL)` : `${w}-${l} (W-L)`;
  };

  const last10 = `Last ${games.length}: ${summarize(games)}`;
  const last5  = games.length >= 5 ? `Last 5: ${summarize(games.slice(-5))}` : "";

  return [last10, last5].filter(Boolean).join(" | ") + "\n\n" + lines.join("\n");
}
