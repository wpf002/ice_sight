import { NextRequest, NextResponse } from "next/server";
import { getAllTeamStats, getTeamStats } from "@/lib/moneypuck";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const team = searchParams.get("team");

  try {
    if (team) {
      const stats = await getTeamStats(team);
      if (!stats) return NextResponse.json({ error: `Team "${team}" not found in MoneyPuck data` }, { status: 404 });
      return NextResponse.json({ stats });
    }
    const all = await getAllTeamStats();
    return NextResponse.json({ stats: all });
  } catch (err) {
    console.error("[MoneyPuck]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
