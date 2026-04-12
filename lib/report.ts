import { ReportInput } from "@/types";
import { formatStatsForPrompt } from "./moneypuck";

export function buildReportPrompt(input: ReportInput): string {
  const myTeam  = input.myTeamSide === "home" ? input.homeTeam.name : input.awayTeam.name;
  const oppTeam = input.myTeamSide === "home" ? input.awayTeam.name : input.homeTeam.name;

  const statsBlock = `
--- OUR TEAM (${myTeam}) ---
${formatStatsForPrompt(input.myTeamStats)}

--- OPPONENT (${oppTeam}) ---
${formatStatsForPrompt(input.opponentStats)}

--- OUR RECENT RESULTS ---
${input.recentGames}
${input.additionalContext ? `\n--- ADDITIONAL CONTEXT ---\n${input.additionalContext}` : ""}`.trim();

  if (input.reportType === "pregame") {
    return buildPregamePrompt(myTeam, oppTeam, input, statsBlock);
  } else {
    return buildPostgamePrompt(myTeam, oppTeam, input, statsBlock);
  }
}

// ── Pre-game ───────────────────────────────────────────────────────────────
function buildPregamePrompt(
  myTeam: string,
  oppTeam: string,
  input: ReportInput,
  statsBlock: string
): string {
  return `You are a professional NHL analytics coach. Write a detailed pre-game scouting report for the ${myTeam} coaching staff.

Game: ${myTeam} (${input.myTeamSide}) vs ${oppTeam} — ${input.gameDate}

${statsBlock}

Write a professional scouting report with the sections below. Be direct and specific — use the actual numbers. No vague language.

# Pre-Game Report: ${myTeam} vs ${oppTeam}
## ${input.gameDate}

### Executive Summary
2–3 sentences. The headline story of this matchup based on the data.

### Opponent Tendencies
Analyze ${oppTeam} using their advanced stats. What are they good at? Where are they vulnerable? Focus on xGoals%, Corsi%, high danger shots, and special teams numbers.

### Our Strengths to Exploit
Where do we have a measurable edge? Reference the stat differentials specifically.

### Key Matchup Concerns
Where does ${oppTeam} hold an advantage? What must we neutralize?

### Special Teams Focus
PP% and PK% comparison. Specific tactical recommendations for tonight.

### Line Deployment Recommendations
Which line types should get elevated ice time in this matchup and why. Tie it to the data.

### Win Probability Assessment
Honest assessment based on xGoals differential and possession metrics. What do the numbers say?

### Keys to Victory
Exactly 3 bullet points. The most critical things we need to do to win.

Tone: confident, direct, coach-facing. Internal document. No hedging.`;
}

// ── Post-game ──────────────────────────────────────────────────────────────
function buildPostgamePrompt(
  myTeam: string,
  oppTeam: string,
  input: ReportInput,
  statsBlock: string
): string {
  const score = input.finalScore
    ? `Final Score: ${myTeam} ${input.finalScore.myTeam} – ${input.finalScore.opponent} ${oppTeam} (${input.finalScore.myTeam > input.finalScore.opponent ? "WIN" : "LOSS"})`
    : "";

  return `You are a professional NHL analytics coach. Write a post-game debrief report for the ${myTeam} coaching staff.

Game: ${myTeam} (${input.myTeamSide}) vs ${oppTeam} — ${input.gameDate}
${score}
${input.gameNotes ? `\nGame Notes from Coach:\n${input.gameNotes}\n` : ""}
${statsBlock}

Write a professional post-game debrief with the sections below. Be direct, honest, and specific. This is an internal document — don't sugarcoat.

# Post-Game Debrief: ${myTeam} vs ${oppTeam}
## ${input.gameDate}${score ? ` · ${score}` : ""}

### Result Summary
2–3 sentences. What happened and what does the result mean in context of the season stats?

### What Worked
Specific things we executed well tonight. Tie observations to the pre-existing stat strengths where relevant.

### What Didn't Work
Honest breakdown of breakdowns. Where did we deviate from our game plan or statistical identity?

### Special Teams Review
How did the PP and PK perform? Any adjustments needed?

### Individual Performances
Flag any standout positive or negative individual performances worth noting for tomorrow's session.

### Opponent Assessment Update
Did ${oppTeam} perform as their stats suggested? Any new tendencies observed that should update our scouting file?

### Adjustments for Next Game
3–5 specific, actionable adjustments based on what we saw tonight.

### Takeaway
One paragraph. The honest bottom line on this game and what it means going forward.

Tone: direct, no-nonsense, coach-facing. This goes to coaching staff only.`;
}
