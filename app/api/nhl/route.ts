import { NextRequest, NextResponse } from "next/server";
import { getTeams, getRecentGames, getUpcomingGames, formatRecentGamesText } from "@/lib/nhl";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    if (action === "teams") {
      const teams = await getTeams();
      return NextResponse.json({ teams });
    }

    if (action === "recent") {
      const abbrev = searchParams.get("abbrev");
      if (!abbrev) return NextResponse.json({ error: "abbrev required" }, { status: 400 });
      const games = await getRecentGames(abbrev);
      const text  = formatRecentGamesText(games, abbrev);
      return NextResponse.json({ games, text });
    }

    if (action === "upcoming") {
      const abbrev = searchParams.get("abbrev");
      if (!abbrev) return NextResponse.json({ error: "abbrev required" }, { status: 400 });
      const games = await getUpcomingGames(abbrev);
      return NextResponse.json({ games });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[NHL API]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
