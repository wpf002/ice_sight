export interface NHLTeam {
  id: string;          // abbreviation used as ID in new API e.g. "DAL"
  name: string;        // full name e.g. "Dallas Stars"
  abbreviation: string;
  locationName: string;
  teamName: string;
}

export interface NHLSkater {
  name: string;
  position: string;           // C | L | R | D
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  toiPerGame: number;         // seconds
  powerPlayPoints: number;
  shorthandedToiPerGame: number;  // seconds — identifies PK specialists
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
