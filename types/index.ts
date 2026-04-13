export interface NHLTeam {
  id: string;          // abbreviation used as ID in new API e.g. "DAL"
  name: string;        // full name e.g. "Dallas Stars"
  abbreviation: string;
  locationName: string;
  teamName: string;
}

export interface NHLSkater {
  name: string;
  position: string;     // C | L | R | D
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  toiPerGame: number;   // seconds
  powerPlayPoints: number;
  evPoints: number;
  plusMinus: number;
  shootingPct: number;  // 0.0–1.0
  shotsPerGame: number; // derived: shots / gamesPlayed
}

export interface NHLGoalie {
  name: string;
  gamesStarted: number;
  wins: number;
  losses: number;
  otLosses: number;
  savePct: number;
  goalsAgainstAverage: number;
  shutouts: number;
  evSavePct?: number;        // 5-on-5 save% — most predictive goalie stat
  ppSavePct?: number;        // save% when opponent is on the power play
  qualityStartPct?: number;  // % of starts that are quality starts
  playedLastNight?: boolean; // back-to-back flag
  recentForm?: {
    games: number;
    wins: number;
    losses: number;
    otLosses: number;
    savePct: number;
    goalsAgainstAverage: number;
  };
}

export interface TeamPersonnel {
  team: string;
  forwards: NHLSkater[];    // top 5 by points
  defensemen: NHLSkater[];  // top 3 by points
  goalie: NHLGoalie | null;
}

export interface NHLGame {
  id: number;
  gameDate: string;
  gameState: string;   // "OFF" = final, "LIVE", "FUT" = upcoming
  homeTeam: { abbrev: string; commonName: { default: string }; score?: number };
  awayTeam: { abbrev: string; commonName: { default: string }; score?: number };
  gameOutcome?: { lastPeriodType: string };  // "REG" | "OT" | "SO"
}

export interface SkaterFaceoff {
  name: string;
  totalFaceoffs: number;
  overallPct: number;  // 0.0–1.0
  dzPct: number;       // defensive zone win%
  ozPct: number;       // offensive zone win%
}

export interface TeamFaceoffStats {
  team: string;          // abbrev
  overallPct: number;    // 0.0–1.0
  ozPct: number;
  dzPct: number;
  nzPct: number;
  ppPct: number;
  pkPct: number;
  topCenters: SkaterFaceoff[];
}

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
  otLosses: number;
  lastMeeting?: {
    date: string;
    result: string;   // e.g. "W 4-2 (HOME)"
  };
}

export interface TeamAdvancedStats {
  team: string;
  gamesPlayed: number;
  xGoalsPercentage: number;
  corsiPercentage: number;
  fenwickPercentage: number;
  shotsForPerGame: number;
  shotsAgainstPerGame: number;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  xGoalsFor: number;
  xGoalsAgainst: number;
  highDangerShotsFor: number;
  highDangerShotsAgainst: number;
  powerPlayPct: number;
  penaltyKillPct: number;
  // Special teams volume — from PP/PK endpoints
  ppOpportunitiesPerGame?: number;
  timesShorthandedPerGame?: number;
  shorthandedGoalsFor?: number;      // our SH goals (PK breakout threat)
  shorthandedGoalsAgainst?: number;  // goals against while on PP (PP vulnerability)
  // Efficiency
  shootingPct?: number;              // goals / shots * 100
}

export interface ReportInput {
  reportType: "pregame" | "postgame";
  homeTeam: NHLTeam;
  awayTeam: NHLTeam;
  myTeamSide: "home" | "away";
  gameDate: string;
  myTeamStats: TeamAdvancedStats;
  opponentStats: TeamAdvancedStats;
  recentGames: string;
  myTeamPersonnel?: TeamPersonnel;
  opponentPersonnel?: TeamPersonnel;
  myTeamFaceoff?: TeamFaceoffStats;
  opponentFaceoff?: TeamFaceoffStats;
  headToHead?: HeadToHeadRecord;
  additionalContext?: string;
  // post-game only
  finalScore?: { myTeam: number; opponent: number };
  gameNotes?: string;
}

export interface GeneratedReport {
  id: string;
  createdAt: string;
  gameDate: string;
  myTeam: string;
  opponent: string;
  reportType: "pregame" | "postgame";
  content: string;
}
