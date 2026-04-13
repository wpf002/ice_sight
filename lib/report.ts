import { ReportInput, TeamAdvancedStats } from "@/types";
import { formatStatsForPrompt } from "./moneypuck";
import { formatPersonnelForPrompt, formatFaceoffForPrompt, formatHeadToHeadForPrompt } from "./nhl";

// ── League-average baselines ───────────────────────────────────────────────
const LEAGUE_PP_AVG  = 21.5;   // NHL average PP conversion %
const LEAGUE_PK_AVG  = 82.5;   // NHL average PK %

function ppLabel(pct: number, team: string): string {
  const avg = LEAGUE_PP_AVG.toFixed(1);
  if (pct >= 26)   return `${team} PP ${pct.toFixed(1)}%: ELITE — well above league-average ${avg}%`;
  if (pct >= 23)   return `${team} PP ${pct.toFixed(1)}%: above league-average ${avg}%`;
  if (pct >= 21)   return `${team} PP ${pct.toFixed(1)}%: slightly below league-average ${avg}%`;
  if (pct >= 18)   return `${team} PP ${pct.toFixed(1)}%: below league-average ${avg}% — a weakness`;
  return           `${team} PP ${pct.toFixed(1)}%: well below league-average ${avg}% — a significant weakness`;
}

function pkLabel(pct: number, team: string): string {
  const avg = LEAGUE_PK_AVG.toFixed(1);
  if (pct >= 86)   return `${team} PK ${pct.toFixed(1)}%: ELITE — well above league-average ${avg}%`;
  if (pct >= 83.5) return `${team} PK ${pct.toFixed(1)}%: above league-average ${avg}%`;
  if (pct >= 81)   return `${team} PK ${pct.toFixed(1)}%: roughly league-average — marginally below ${avg}%`;
  if (pct >= 78)   return `${team} PK ${pct.toFixed(1)}%: below league-average ${avg}%`;
  return           `${team} PK ${pct.toFixed(1)}%: well below league-average ${avg}% — a clear liability`;
}

function edgeLabel(myVal: number, oppVal: number, higherIsBetter = true): string {
  const diff = higherIsBetter ? myVal - oppVal : oppVal - myVal;
  if (diff >  0.6) return "significant advantage";
  if (diff >  0.25) return "clear advantage";
  if (diff >  0.05) return "slight advantage";
  if (diff > -0.05) return "roughly equal";
  if (diff > -0.25) return "slight deficit";
  if (diff > -0.6)  return "clear deficit";
  return "significant deficit";
}

function buildBenchmarks(
  myTeam: string,
  oppTeam: string,
  my: TeamAdvancedStats,
  opp: TeamAdvancedStats,
): string {
  const gfEdge = edgeLabel(my.goalsForPerGame, opp.goalsForPerGame);
  const gaEdge = edgeLabel(my.goalsAgainstPerGame, opp.goalsAgainstPerGame, false);
  const posEdge = edgeLabel(my.corsiPercentage, opp.corsiPercentage);

  return `\nBENCHMARK VERDICTS — copy these characterizations verbatim when referencing these stats:
${ppLabel(my.powerPlayPct, myTeam)}
${ppLabel(opp.powerPlayPct, oppTeam)}
${pkLabel(my.penaltyKillPct, myTeam)}
${pkLabel(opp.penaltyKillPct, oppTeam)}
Goals scored/game: ${myTeam} ${my.goalsForPerGame.toFixed(2)} vs ${oppTeam} ${opp.goalsForPerGame.toFixed(2)} — ${gfEdge} for ${myTeam}
Goals allowed/game: ${myTeam} ${my.goalsAgainstPerGame.toFixed(2)} vs ${oppTeam} ${opp.goalsAgainstPerGame.toFixed(2)} — ${gaEdge} for ${myTeam}
Possession (shots%): ${myTeam} ${my.corsiPercentage.toFixed(1)}% vs ${oppTeam} ${opp.corsiPercentage.toFixed(1)}% — ${posEdge} for ${myTeam}
5v5 SV% league-average: .919 — above = above average; below = below average
PP-against SV% league-average: ~.880 (average band .875–.895)
When citing ${myTeam}'s recent record, copy the EXACT label from the "OUR LAST 10 GAMES" block — do not rephrase or invent a different record.`
    .trim();
}

interface ReportPrompt {
  prompt: string;
  titlePrefill: string;
}

export function buildReportPrompt(input: ReportInput): ReportPrompt {
  const myTeam  = input.myTeamSide === "home" ? input.homeTeam.name : input.awayTeam.name;
  const oppTeam = input.myTeamSide === "home" ? input.awayTeam.name : input.homeTeam.name;
  const venue   = input.myTeamSide === "home" ? "Home — American Airlines Center" : "Away";

  const statsBlock = `OUR TEAM (${myTeam})
${formatStatsForPrompt(input.myTeamStats)}
${input.myTeamFaceoff ? "\n" + formatFaceoffForPrompt(input.myTeamFaceoff) : ""}
${input.myTeamPersonnel ? "\n" + formatPersonnelForPrompt(input.myTeamPersonnel) : ""}

OPPONENT (${oppTeam})
${formatStatsForPrompt(input.opponentStats)}
${input.opponentFaceoff ? "\n" + formatFaceoffForPrompt(input.opponentFaceoff) : ""}
${input.opponentPersonnel ? "\n" + formatPersonnelForPrompt(input.opponentPersonnel) : ""}

OUR LAST 10 GAMES
${input.recentGames}
${input.headToHead ? `\n${formatHeadToHeadForPrompt(input.headToHead, myTeam, oppTeam)}` : ""}
${input.additionalContext ? `\nSCOUT NOTES\n${input.additionalContext}` : ""}

${buildBenchmarks(myTeam, oppTeam, input.myTeamStats, input.opponentStats)}`.trim();

  if (input.reportType === "pregame") {
    return buildPregamePrompt(myTeam, oppTeam, venue, input, statsBlock);
  } else {
    return buildPostgamePrompt(myTeam, oppTeam, venue, input, statsBlock);
  }
}

// ── Pre-game ───────────────────────────────────────────────────────────────
function buildPregamePrompt(
  myTeam: string,
  oppTeam: string,
  venue: string,
  input: ReportInput,
  statsBlock: string
): ReportPrompt {
  const titlePrefill = `# Pre-Game Report: ${myTeam} vs ${oppTeam}\n*${input.gameDate} · ${venue}*`;

  const prompt = `GAME: ${myTeam} (${input.myTeamSide}) vs ${oppTeam} · ${input.gameDate}

${statsBlock}

---

The report title is already written. Follow the section structure below exactly.

Copy every ## and ### heading exactly as written. Replace content in <angle brackets> with real analysis. Use **bold** for key numbers and names.

## Executive Summary
<2–3 sentences. The single biggest data story of this matchup. Direct. No hedging.>

## ${oppTeam} Breakdown

### What They Do Well
<One paragraph. Every claim backed by a specific number from the stats above.>

### Where They're Exploitable
<One paragraph. Every claim backed by a specific number from the stats above.>

## Our Strengths
<The measurable edges ${myTeam} holds. Cite the differentials. If an edge is slim or nonexistent, say so plainly.>

## Threat Assessment
<Where ${oppTeam} is most dangerous tonight. What specifically must be neutralized. Tied to the data.>

## Special Teams

### Power Play
<Tactical notes for ${myTeam}'s power play against this opponent's ${input.opponentStats.penaltyKillPct.toFixed(1)}% penalty kill.>

### Penalty Kill
<Tactical notes for ${myTeam}'s penalty kill against this opponent's ${input.opponentStats.powerPlayPct.toFixed(1)}% power play.>

## Deployment Notes
<Specific ice time and matchup recommendations tied to the data.>

## Win Probability
<Write "${myTeam}: XX%" on its own line, where XX is your probability estimate. Then exactly two sentences of rationale. Nothing else in this section.>

## Keys to Victory
- <Key 1: specific and actionable, tied to the data>
- <Key 2: specific and actionable, tied to the data>
- <Key 3: specific and actionable, tied to the data>`;

  return { prompt, titlePrefill };
}

// ── Post-game ──────────────────────────────────────────────────────────────
function buildPostgamePrompt(
  myTeam: string,
  oppTeam: string,
  venue: string,
  input: ReportInput,
  statsBlock: string
): ReportPrompt {
  const resultLine = input.finalScore
    ? `${myTeam} ${input.finalScore.myTeam}, ${oppTeam} ${input.finalScore.opponent} — ${input.finalScore.myTeam > input.finalScore.opponent ? "WIN" : "LOSS"}`
    : "Score not recorded";

  const titlePrefill = `# Post-Game Debrief: ${myTeam} vs ${oppTeam}\n*${input.gameDate} · ${venue} · ${resultLine}*`;

  const prompt = `GAME: ${myTeam} (${input.myTeamSide}) vs ${oppTeam} · ${input.gameDate}
RESULT: ${resultLine}
${input.gameNotes ? `\nCOACH NOTES: ${input.gameNotes}\n` : ""}
${statsBlock}

---

The report title is already written. Begin your response immediately with 2–3 sentences of result summary — NO section heading before it, just the prose. Then continue with the sections below.

Copy every ## and ### heading exactly as written. Replace content in <angle brackets> with real analysis. Use **bold** for key numbers and names.

<2–3 sentence result summary — what happened and what it means in context of season stats.>

## What Worked
<Specific executions tied to statistical strengths. Cite numbers. If nothing worked, say so plainly.>

## What Didn't Work
<Honest breakdown. Where did the team deviate from its identity? No excuses.>

## Special Teams Review
<How did the PP and PK perform? Specific percentages and opportunities. What needs to change?>

## Individual Standouts
<Positive or negative individual performances worth addressing. Name names, cite numbers.>

## Opponent Assessment Update
<Did ${oppTeam} perform as their stats suggested? Any new tendencies to add to the scouting file?>

## Adjustments for Next Game
1. <Specific, actionable change>
2. <Specific, actionable change>
3. <Specific, actionable change>

## Takeaway
<One paragraph. The honest bottom line and what it means going forward.>`;

  return { prompt, titlePrefill };
}
