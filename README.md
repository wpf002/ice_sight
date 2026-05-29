# IceSight 🏒

NHL analytics report generator for coaching staff. Pulls live data, generates AI-drafted reports, and lets coaches edit and export before submission.

## Features

- **Pre-game scouting reports** — opponent tendencies, matchup edges, line deployment, win probability, keys to victory
- **Post-game debriefs** — what worked, what didn't, adjustments for next game
- **Report history** — all reports saved to localStorage, accessible from the history sidebar
- **Export options** — .docx Word download, Print to PDF, or copy to clipboard
- **Inline editing** — click anywhere in the report to edit before exporting

## Stack

- **Next.js 14** — frontend + API routes
- **TypeScript + Tailwind CSS**
- **Anthropic Claude API** — report generation (`claude-sonnet-4-6`, validated with `claude-haiku-4-5`)
- **NHL Web API** (`api-web.nhle.com/v1`) — teams, full schedules, game results, goalie game logs
- **NHL Stats API** (`api.nhle.com/stats/rest/en`) — team/skater/goalie stats, PP%, PK%, face-offs
- **docx + file-saver** — Word document export

> **Note on possession metrics:** true Corsi/Fenwick/xGoals and high-danger shot data require a licensed source (e.g. MoneyPuck) and are **not** included. Where a possession signal is needed the app derives `shotsSharePct` (share of total shots) from NHL shot totals as a directional proxy, labelled as such.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
bash dev.sh
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
ice_sight/
├── app/
│   ├── api/
│   │   ├── nhl/route.ts           # NHL API proxy (teams, schedule, personnel, face-offs, H2H)
│   │   ├── teamstats/route.ts     # Team stats from the NHL Stats API
│   │   └── report/route.ts        # Claude report generation
│   ├── report/[id]/page.tsx       # Report editor + export
│   ├── page.tsx                   # Home — matchup selector + history
│   ├── layout.tsx
│   └── globals.css                # Dallas Stars theme
├── lib/
│   ├── nhl.ts                     # NHL API helpers
│   ├── teamstats.ts               # Team stats from the NHL Stats API
│   ├── teamColors.ts              # Per-team UI theming palette
│   ├── report.ts                  # Pregame + postgame prompts
│   ├── docx.ts                    # Word document export
│   └── history.ts                 # localStorage report history
├── types/index.ts
├── dev.sh                         # Single startup command
└── .env.local.example
```
