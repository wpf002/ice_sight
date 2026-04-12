"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NHLTeam, TeamAdvancedStats, GeneratedReport } from "@/types";
import { getHistory, deleteFromHistory } from "@/lib/history";

export default function HomePage() {
  const router = useRouter();

  // ── Form state ────────────────────────────────────────────────────────────
  const [teams, setTeams]               = useState<NHLTeam[]>([]);
  const [reportType, setReportType]     = useState<"pregame" | "postgame">("pregame");
  const [myTeamId, setMyTeamId]         = useState("");
  const [opponentId, setOpponentId]     = useState("");
  const [myTeamSide, setMyTeamSide]     = useState<"home" | "away">("home");
  const [gameDate, setGameDate]         = useState(new Date().toISOString().split("T")[0]);
  const [context, setContext]           = useState("");
  const [myScore, setMyScore]           = useState("");
  const [oppScore, setOppScore]         = useState("");
  const [gameNotes, setGameNotes]       = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(false);
  const [loadingStep, setLoadingStep]   = useState("");
  const [error, setError]               = useState("");
  const [history, setHistory]           = useState<GeneratedReport[]>([]);
  const [showHistory, setShowHistory]   = useState(false);

  useEffect(() => {
    fetch("/api/nhl?action=teams")
      .then((r) => r.json())
      .then((d) => setTeams(d.teams ?? []))
      .catch(() => setError("Failed to load teams — check NHL API connection"));
    setHistory(getHistory());
  }, []);

  const myTeam   = teams.find((t) => t.id === myTeamId);
  const opponent = teams.find((t) => t.id === opponentId);
  const canGenerate = !loading && !!myTeamId && !!opponentId && myTeamId !== opponentId;

  async function handleGenerate() {
    if (!canGenerate || !myTeam || !opponent) return;
    setError("");
    setLoading(true);

    try {
      setLoadingStep("Fetching recent game results...");
      const recentRes  = await fetch(`/api/nhl?action=recent&abbrev=${myTeamId}`);
      const recentData = await recentRes.json();

      setLoadingStep("Loading advanced stats from MoneyPuck...");
      const [myStatsRes, oppStatsRes] = await Promise.all([
        fetch(`/api/moneypuck?team=${myTeamId}`),
        fetch(`/api/moneypuck?team=${opponentId}`),
      ]);

      const myStatsData  = await myStatsRes.json();
      const oppStatsData = await oppStatsRes.json();

      // Fallback is only used if the NHL stats API is down — these are league averages, not team-specific
      const fallback = (team: string): TeamAdvancedStats => ({
        team, gamesPlayed: 80, xGoalsPercentage: 50, corsiPercentage: 50,
        fenwickPercentage: 50, shotsForPerGame: 27, shotsAgainstPerGame: 27,
        goalsForPerGame: 3.1, goalsAgainstPerGame: 3.1, xGoalsFor: 248, xGoalsAgainst: 248,
        highDangerShotsFor: 504, highDangerShotsAgainst: 504, powerPlayPct: 20.5, penaltyKillPct: 79.5,
      });

      const myTeamStats  = myStatsData.stats  ?? fallback(myTeamId);
      const opponentStats = oppStatsData.stats ?? fallback(opponentId);

      const id = Date.now().toString();
      const reportInput = {
        reportType,
        homeTeam:   myTeamSide === "home" ? myTeam : opponent,
        awayTeam:   myTeamSide === "away" ? myTeam : opponent,
        myTeamSide, gameDate, myTeamStats, opponentStats,
        recentGames: recentData.text ?? "No recent games found.",
        additionalContext: context || undefined,
        ...(reportType === "postgame" && {
          finalScore: myScore && oppScore
            ? { myTeam: parseInt(myScore), opponent: parseInt(oppScore) }
            : undefined,
          gameNotes: gameNotes || undefined,
        }),
      };

      // Store pending metadata and navigate immediately — report page handles streaming
      sessionStorage.setItem(`report_pending_${id}`, JSON.stringify({
        id, reportInput,
        myTeam: myTeam.name,
        opponent: opponent.name,
        gameDate, reportType,
        createdAt: new Date().toISOString(),
      }));

      router.push(`/report/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  function handleDeleteHistory(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    deleteFromHistory(id);
    setHistory(getHistory());
  }

  function openReport(report: GeneratedReport) {
    sessionStorage.setItem(`report_${report.id}`, JSON.stringify(report));
    router.push(`/report/${report.id}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", position: "relative", overflow: "hidden" }}>

      {/* Ambient glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `
          radial-gradient(ellipse 60% 50% at 15% 60%, rgba(0,104,71,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 40% 35% at 85% 15%, rgba(200,168,75,0.04) 0%, transparent 60%)`,
      }} />
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", zIndex: 100, background: "linear-gradient(90deg, transparent, var(--accent) 30%, var(--gold) 70%, transparent)" }} />

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        borderBottom: "1px solid var(--border)", background: "rgba(5,7,8,0.97)",
        backdropFilter: "blur(16px)", height: "56px",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <StarIcon size={20} color="var(--accent)" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Ice<span style={{ color: "var(--accent-bright)" }}>Sight</span>
          </span>
          <div style={{ width: "1px", height: "16px", background: "var(--border-bright)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--gold)", background: "rgba(200,168,75,0.1)", border: "1px solid rgba(200,168,75,0.2)", padding: "2px 6px", borderRadius: "2px", letterSpacing: "0.12em" }}>
            DALLAS STARS ANALYTICS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {history.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)} style={{
              background: showHistory ? "var(--accent-dim)" : "none",
              border: `1px solid ${showHistory ? "var(--accent)" : "var(--border)"}`,
              color: showHistory ? "var(--accent-bright)" : "var(--text-muted)",
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.7rem",
              letterSpacing: "0.1em", textTransform: "uppercase",
              padding: "0.3rem 0.7rem", borderRadius: "4px", cursor: "pointer",
            }}>
              History ({history.length})
            </button>
          )}
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--accent-bright)", boxShadow: "0 0 6px var(--accent)", animation: "pulse 2s infinite" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--text-muted)" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>
      </header>

      <div style={{ display: "flex", position: "relative", zIndex: 1 }}>

        {/* History sidebar */}
        {showHistory && (
          <aside style={{
            width: "300px", flexShrink: 0, borderRight: "1px solid var(--border)",
            background: "var(--surface)", height: "calc(100vh - 56px)",
            overflowY: "auto", position: "sticky", top: "56px",
          }}>
            <div style={{ padding: "1.25rem 1.25rem 0.75rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>Report History</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-dim)" }}>{history.length} reports</span>
            </div>
            {history.map((r) => (
              <div key={r.id} onClick={() => openReport(r)} style={{
                padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)",
                cursor: "pointer", transition: "background 0.12s", position: "relative",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "3px" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.55rem", padding: "1px 5px",
                    borderRadius: "2px", letterSpacing: "0.08em",
                    background: r.reportType === "pregame" ? "rgba(0,104,71,0.2)" : "rgba(200,168,75,0.15)",
                    color: r.reportType === "pregame" ? "var(--accent-bright)" : "var(--gold)",
                    border: `1px solid ${r.reportType === "pregame" ? "rgba(0,104,71,0.3)" : "rgba(200,168,75,0.2)"}`,
                  }}>
                    {r.reportType === "pregame" ? "PRE" : "POST"}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-dim)" }}>{r.gameDate}</span>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.88rem", color: "var(--text)" }}>
                  {r.myTeam}
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  vs {r.opponent}
                </div>
                <button
                  onClick={(e) => handleDeleteHistory(r.id, e)}
                  style={{
                    position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer",
                    fontSize: "0.8rem", padding: "4px",
                  }}
                >✕</button>
              </div>
            ))}
          </aside>
        )}

        {/* Main content */}
        <main style={{ flex: 1, maxWidth: "680px", margin: "0 auto", padding: "3rem 2rem 5rem" }}>

          {/* Title */}
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ height: "1px", flex: "0 0 28px", background: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent-bright)" }}>
                Analytics Report Generator
              </span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 0.92, marginBottom: "1rem" }}>
              <span style={{ display: "block", fontSize: "4rem", color: "var(--text)" }}>Scouting</span>
              <span style={{ display: "block", fontSize: "4rem", color: "transparent", WebkitTextStroke: "2px var(--accent)" }}>Report</span>
            </h1>
          </div>

          {/* Form card */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden", boxShadow: "0 0 40px rgba(0,0,0,0.4)" }}>
            <div style={{ height: "3px", background: "linear-gradient(90deg, var(--accent), var(--accent-light) 60%, var(--gold))" }} />

            <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

              {/* Report type toggle */}
              <div>
                <label style={labelStyle}>Report Type</label>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {(["pregame", "postgame"] as const).map((type) => (
                    <button key={type} onClick={() => setReportType(type)} style={{
                      flex: 1, padding: "0.65rem",
                      background: reportType === type ? "var(--accent)" : "var(--surface-2)",
                      color: reportType === type ? "#fff" : "var(--text-muted)",
                      border: `1px solid ${reportType === type ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: "5px", fontFamily: "var(--font-display)", fontWeight: 700,
                      fontSize: "0.85rem", letterSpacing: "0.1em", textTransform: "uppercase",
                      cursor: "pointer", transition: "all 0.12s",
                      boxShadow: reportType === type ? "0 0 12px rgba(0,104,71,0.25)" : "none",
                    }}>
                      {type === "pregame" ? "⚡ Pre-Game" : "📋 Post-Game"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Teams */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <SelectField label="Our Team" value={myTeamId} onChange={setMyTeamId} teams={teams} exclude={opponentId} />
                <SelectField label="Opponent"  value={opponentId} onChange={setOpponentId} teams={teams} exclude={myTeamId} />
              </div>

              {/* Side + Date */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={labelStyle}>We Are Playing</label>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {(["home", "away"] as const).map((side) => (
                      <button key={side} onClick={() => setMyTeamSide(side)} style={{
                        flex: 1, padding: "0.6rem",
                        background: myTeamSide === side ? "var(--accent)" : "var(--surface-2)",
                        color: myTeamSide === side ? "#fff" : "var(--text-muted)",
                        border: `1px solid ${myTeamSide === side ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: "5px", fontFamily: "var(--font-display)", fontWeight: 700,
                        fontSize: "0.85rem", letterSpacing: "0.1em", textTransform: "uppercase",
                        cursor: "pointer", transition: "all 0.12s",
                      }}>{side}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Game Date</label>
                  <input type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Post-game: score + notes */}
              {reportType === "postgame" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={labelStyle}>Our Score</label>
                      <input type="number" min="0" max="20" value={myScore} onChange={(e) => setMyScore(e.target.value)} placeholder="0" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Opponent Score</label>
                      <input type="number" min="0" max="20" value={oppScore} onChange={(e) => setOppScore(e.target.value)} placeholder="0" style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Game Notes
                      <span style={{ marginLeft: "0.5rem", color: "var(--text-dim)", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "0.65rem" }}>optional</span>
                    </label>
                    <textarea value={gameNotes} onChange={(e) => setGameNotes(e.target.value)}
                      placeholder="What happened? Key moments, line changes, goalie performance, anything notable..."
                      rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
                  </div>
                </>
              )}

              {/* Scout notes */}
              <div>
                <label style={labelStyle}>
                  {reportType === "pregame" ? "Scout Notes" : "Additional Context"}
                  <span style={{ marginLeft: "0.5rem", color: "var(--text-dim)", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "0.65rem" }}>optional</span>
                </label>
                <textarea value={context} onChange={(e) => setContext(e.target.value)}
                  placeholder={reportType === "pregame"
                    ? "Injured players, lineup changes, travel fatigue, key matchup concerns..."
                    : "Coaching adjustments made, unusual circumstances, player issues..."}
                  rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
              </div>

              {/* Matchup preview */}
              {myTeam && opponent && (
                <div style={{
                  background: "var(--surface-3)", border: "1px solid var(--border-bright)",
                  borderRadius: "8px", padding: "1rem 1.5rem",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "3px", background: "var(--accent)" }} />
                  <div style={{ marginLeft: "0.75rem" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--accent-bright)", letterSpacing: "0.15em", marginBottom: "3px" }}>OUR TEAM</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.05rem", color: "var(--text)" }}>{myTeam.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--text-muted)", textTransform: "uppercase" }}>{myTeamSide}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 900, color: "var(--gold)" }}>VS</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "var(--text-dim)" }}>{gameDate}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--text-muted)", letterSpacing: "0.15em", marginBottom: "3px" }}>OPPONENT</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.05rem", color: "var(--text-muted)" }}>{opponent.name}</div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ color: "#ff7070", fontFamily: "var(--font-mono)", fontSize: "0.75rem", padding: "0.7rem 0.9rem", background: "rgba(204,51,51,0.08)", borderRadius: "5px", border: "1px solid rgba(204,51,51,0.2)" }}>
                  ⚠ {error}
                </div>
              )}

              {/* Generate */}
              <button onClick={handleGenerate} disabled={!canGenerate} style={{
                padding: "1rem 1.5rem",
                background: canGenerate ? "linear-gradient(135deg, #006847, #008a5e)" : "var(--surface-3)",
                color: canGenerate ? "#fff" : "var(--text-dim)",
                border: `1px solid ${canGenerate ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "7px", fontFamily: "var(--font-display)", fontWeight: 800,
                fontSize: "1.05rem", letterSpacing: "0.12em", textTransform: "uppercase",
                cursor: canGenerate ? "pointer" : "not-allowed", transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.65rem",
                boxShadow: canGenerate ? "0 4px 24px rgba(0,104,71,0.25)" : "none",
              }}>
                {loading ? (
                  <>
                    <Spinner />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", fontWeight: 400, textTransform: "none", color: "#a0c8b8" }}>{loadingStep}</span>
                  </>
                ) : (
                  <>
                    <StarIcon size={15} color="currentColor" />
                    {reportType === "pregame" ? "Generate Pre-Game Report" : "Generate Post-Game Debrief"}
                  </>
                )}
              </button>

            </div>
          </div>

          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-dim)", textAlign: "center", marginTop: "2rem", letterSpacing: "0.1em" }}>
            ★ &nbsp; NHL API · MONEYPUCK ADVANCED STATS · CLAUDE AI &nbsp; ★
          </p>
        </main>
      </div>

      <style suppressHydrationWarning>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5) sepia(1) saturate(2) hue-rotate(90deg); cursor: pointer; }
        select option { background: #131618; color: #f0f2f4; }
        select:focus, input:focus, textarea:focus { border-color: var(--accent) !important; outline: none; }
      `}</style>
    </div>
  );
}

function StarIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <polygon points="12,2 14.8,9.2 22.5,9.2 16.4,13.8 18.6,21 12,16.5 5.4,21 7.6,13.8 1.5,9.2 9.2,9.2" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "spin 0.75s linear infinite", flexShrink: 0 }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function SelectField({ label, value, onChange, teams, exclude }: {
  label: string; value: string; onChange: (v: string) => void; teams: NHLTeam[]; exclude?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">Select team...</option>
        {teams.filter((t) => t.id !== exclude).map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: "var(--font-display)", fontWeight: 700,
  fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase",
  color: "var(--text-muted)", marginBottom: "0.45rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.65rem 0.85rem",
  background: "var(--surface-2)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "5px",
  fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none",
  transition: "border-color 0.15s",
};
