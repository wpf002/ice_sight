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
- **Anthropic Claude API** — report generation (claude-opus-4-5)
- **NHL API** (`api-web.nhle.com/v1`) — teams, schedules, game results
- **MoneyPuck** — xGoals%, Corsi%, Fenwick%, high danger shots, PP%, PK%
- **docx + file-saver** — Word document export

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
│   │   ├── nhl/route.ts           # NHL API proxy (new api-web.nhle.com/v1)
│   │   ├── moneypuck/route.ts     # MoneyPuck advanced stats
│   │   └── report/route.ts        # Claude report generation
│   ├── report/[id]/page.tsx       # Report editor + export
│   ├── page.tsx                   # Home — matchup selector + history
│   ├── layout.tsx
│   └── globals.css                # Dallas Stars theme
├── lib/
│   ├── nhl.ts                     # NHL API helpers
│   ├── moneypuck.ts               # Dynamic column parsing
│   ├── report.ts                  # Pregame + postgame prompts
│   ├── docx.ts                    # Word document export
│   └── history.ts                 # localStorage report history
├── types/index.ts
├── dev.sh                         # Single startup command
└── .env.local.example
```
