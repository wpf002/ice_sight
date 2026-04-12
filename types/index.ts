export interface NHLTeam {
  id: string;          // abbreviation used as ID in new API e.g. "DAL"
  name: string;        // full name e.g. "Dallas Stars"
  abbreviation: string;
  locationName: string;
  teamName: string;
}

export interface NHLGame {
  id: number;
  gameDate: string;
  gameState: string;   // "OFF" = final, "LIVE", "FUT" = upcoming
  homeTeam: { abbrev: string; commonName: { default: string }; score?: number };
  awayTeam: { abbrev: string; commonName: { default: string }; score?: number };
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
