"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { GeneratedReport } from "@/types";
import { saveToHistory } from "@/lib/history";

export default function ReportPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);

  const [report, setReport]         = useState<GeneratedReport | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "copied" | "exporting">("idle");

  useEffect(() => {
    // Try sessionStorage first (just generated), then localStorage (history)
    const raw =
      sessionStorage.getItem(`report_${id}`) ??
      JSON.stringify(
        JSON.parse(localStorage.getItem("icesight_history") ?? "[]")
          .find((r: GeneratedReport) => r.id === id) ?? null
      );

    if (!raw || raw === "null") { router.push("/"); return; }

    const data: GeneratedReport = JSON.parse(raw);
    setReport(data);
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(data.content);
    }
  }, [id]);

  function markdownToHtml(md: string): string {
    return md
      .replace(/^# (.+)$/gm,    "<h1>$1</h1>")
      .replace(/^## (.+)$/gm,   "<h2>$1</h2>")
      .replace(/^### (.+)$/gm,  "<h3>$1</h3>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^- (.+)$/gm,    "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      .split("\n")
      .map((line) => {
        if (line.startsWith("<h") || line.startsWith("<ul") || line.startsWith("<li")) return line;
        if (!line.trim()) return "";
        return `<p>${line}</p>`;
      })
      .filter(Boolean)
      .join("\n");
  }

  function persistEdit() {
    if (!report || !editorRef.current) return;
    const updated = { ...report, content: editorRef.current.innerHTML };
    sessionStorage.setItem(`report_${id}`, JSON.stringify(updated));
    saveToHistory(updated);
    setReport(updated);
  }

  function handleSave() {
    persistEdit();
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  function handleCopy() {
    navigator.clipboard.writeText(editorRef.current?.innerText ?? "");
    setSaveStatus("copied");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function handleDocx() {
    if (!report || !editorRef.current) return;
    setSaveStatus("exporting");
    try {
      const { exportToDocx } = await import("@/lib/docx");
      await exportToDocx(report, editorRef.current.innerHTML);
    } catch (err) {
      console.error("DOCX export failed:", err);
    } finally {
      setSaveStatus("idle");
    }
  }

  if (!report) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Spinner />
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "0.8rem" }}>Loading...</span>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", zIndex: 100, background: "linear-gradient(90deg, transparent, var(--accent) 30%, var(--gold) 70%, transparent)" }} />

      {/* Toolbar */}
      <header className="no-print" style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(5,7,8,0.97)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)", height: "56px",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button onClick={() => router.push("/")} style={{
            background: "none", border: "1px solid var(--border)", color: "var(--text-muted)",
            cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "0.3rem 0.7rem", borderRadius: "4px",
          }}>← New</button>
          <div style={{ width: "1px", height: "16px", background: "var(--border-bright)" }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <StarIcon size={11} color="var(--accent)" />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.9rem", color: "var(--text)" }}>{report.myTeam}</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "0.8rem", color: "var(--gold)", fontWeight: 700 }}>VS</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-muted)" }}>{report.opponent}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1px" }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "0.55rem", padding: "1px 5px", borderRadius: "2px",
                background: report.reportType === "pregame" ? "rgba(0,104,71,0.2)" : "rgba(200,168,75,0.15)",
                color: report.reportType === "pregame" ? "var(--accent-bright)" : "var(--gold)",
                border: `1px solid ${report.reportType === "pregame" ? "rgba(0,104,71,0.3)" : "rgba(200,168,75,0.2)"}`,
              }}>
                {report.reportType === "pregame" ? "PRE-GAME" : "POST-GAME"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "var(--text-dim)" }}>
                {report.gameDate} · {new Date(report.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {saveStatus !== "idle" && saveStatus !== "exporting" && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--accent-bright)" }}>
              {saveStatus === "saved" ? "✓ Saved" : "✓ Copied"}
            </span>
          )}
          <TBtn onClick={handleSave}  label="Save" />
          <TBtn onClick={handleCopy}  label="Copy" />
          <TBtn onClick={handleDocx}  label={saveStatus === "exporting" ? "Exporting..." : "Export .docx"} />
          <TBtn onClick={() => window.print()} label="Print / PDF" accent />
        </div>
      </header>

      {/* Report */}
      <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 2rem 5rem" }}>
        <div className="no-print" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
          <Badge text={report.reportType === "pregame" ? "SCOUTING REPORT" : "POST-GAME DEBRIEF"} color="var(--accent-bright)" bg="rgba(0,104,71,0.12)" border="rgba(0,104,71,0.25)" />
          <Badge text={report.gameDate} />
          <Badge text={`${report.myTeam} vs ${report.opponent}`.toUpperCase()} />
          <Badge text="✎ CLICK TO EDIT" color="var(--gold)" bg="rgba(200,168,75,0.08)" border="rgba(200,168,75,0.2)" />
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="report-editor"
          onBlur={persistEdit}
          style={{
            outline: "none", minHeight: "65vh",
            padding: "2.75rem 3rem",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "10px", lineHeight: 1.75,
            boxShadow: "0 0 40px rgba(0,0,0,0.3)",
          }}
        />

        <p className="no-print" style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--text-dim)", textAlign: "center", marginTop: "1.25rem" }}>
          Click inside to edit · Auto-saves on click-away · Export as .docx or Print to PDF
        </p>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          .report-editor { background: white !important; border: none !important; padding: 0 !important; box-shadow: none !important; }
          .report-editor h1, .report-editor h2, .report-editor h3 { color: #000 !important; }
          .report-editor h2 { border-bottom-color: #ccc !important; }
          .report-editor p, .report-editor li { color: #333 !important; }
        }
      `}</style>
    </div>
  );
}

function StarIcon({ size = 16, color = "var(--accent)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <polygon points="12,2 14.8,9.2 22.5,9.2 16.4,13.8 18.6,21 12,16.5 5.4,21 7.6,13.8 1.5,9.2 9.2,9.2" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "spin 0.75s linear infinite", color: "var(--text-muted)" }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function TBtn({ onClick, label, accent }: { onClick: () => void; label: string; accent?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: "0.35rem 0.8rem",
      background: accent ? "var(--accent)" : "var(--surface-2)",
      color: accent ? "#fff" : "var(--text-muted)",
      border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
      borderRadius: "4px", fontFamily: "var(--font-display)", fontWeight: 700,
      fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase",
      cursor: "pointer", transition: "all 0.12s",
      boxShadow: accent ? "0 0 10px rgba(0,104,71,0.2)" : "none",
    }}>{label}</button>
  );
}

function Badge({ text, color, bg, border }: { text: string; color?: string; bg?: string; border?: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.1em",
      color: color ?? "var(--text-dim)", background: bg ?? "transparent",
      border: `1px solid ${border ?? "var(--border)"}`, padding: "3px 8px", borderRadius: "3px",
    }}>{text}</span>
  );
}
