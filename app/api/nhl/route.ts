import { NextRequest, NextResponse } from "next/server";
import { getTeams, getRecentGames, getUpcomingGames, formatRecentGamesText, getTeamPersonnel, getTeamFaceoffStats, getHeadToHead } from "@/lib/nhl";

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

    if (action === "personnel") {
      const abbrev = searchParams.get("abbrev");
      if (!abbrev) return NextResponse.json({ error: "abbrev required" }, { status: 400 });
      const personnel = await getTeamPersonnel(abbrev);
      return NextResponse.json({ personnel });
    }

    if (action === "faceoff") {
      const abbrev = searchParams.get("abbrev");
      if (!abbrev) return NextResponse.json({ error: "abbrev required" }, { status: 400 });
      const faceoff = await getTeamFaceoffStats(abbrev);
      return NextResponse.json({ faceoff });
    }

    if (action === "headtohead") {
      const abbrev = searchParams.get("abbrev");
      const opp    = searchParams.get("opp");
      if (!abbrev || !opp) return NextResponse.json({ error: "abbrev and opp required" }, { status: 400 });
      const h2h = await getHeadToHead(abbrev, opp);
      return NextResponse.json({ h2h });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[NHL API]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
