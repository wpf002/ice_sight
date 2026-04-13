"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { GeneratedReport, ReportInput } from "@/types";
import { saveToHistory } from "@/lib/history";

export default function ReportPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);

  const [report, setReport]         = useState<GeneratedReport | null>(null);
  const [streaming, setStreaming]   = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "copied" | "exporting">("idle");
  const streamedText   = useRef("");
  const reportInputRef = useRef<ReportInput | null>(null);

  useEffect(() => {
    // Completed report in sessionStorage or history
    const completed =
      sessionStorage.getItem(`report_${id}`) ??
      JSON.stringify(
        JSON.parse(localStorage.getItem("icesight_history") ?? "[]")
          .find((r: GeneratedReport) => r.id === id) ?? null
      );

    if (completed && completed !== "null") {
      const data: GeneratedReport = JSON.parse(completed);
      setReport(data);
      return;
    }

    // Pending report — navigate here before Claude runs
    const pendingRaw = sessionStorage.getItem(`report_pending_${id}`);
    if (!pendingRaw) { router.push("/"); return; }

    const pending = JSON.parse(pendingRaw);
    reportInputRef.current = pending.reportInput ?? null;
    const meta: GeneratedReport = {
      id: pending.id,
      myTeam: pending.myTeam,
      opponent: pending.opponent,
      gameDate: pending.gameDate,
      reportType: pending.reportType,
      createdAt: pending.createdAt,
      content: "",
    };
    setReport(meta);
    setStreaming(true);
    setHasContent(false);
    setElapsed(0);

    // Stream Claude's response directly into the editor
    streamedText.current = "";
    const abortController = new AbortController();

    (async () => {
      let renderTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleRender = () => {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.innerHTML = markdownToHtml(deduplicateSections(streamedText.current));
            injectSpecialTeamsTable(editorRef.current);
            editorRef.current.scrollTop = editorRef.current.scrollHeight;
            setHasContent(true);
          }
        }, 200);
      };

      let wasAborted = false;
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending.reportInput),
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          let detail = `API error ${res.status}`;
          try {
            const errJson = await res.json();
            if (errJson?.error) detail = errJson.error;
          } catch { /* non-JSON error body — use status code */ }
          throw new Error(detail);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          streamedText.current += decoder.decode(value, { stream: true });
          scheduleRender();
        }
        if (renderTimer) clearTimeout(renderTimer);
        if (editorRef.current) {
          editorRef.current.innerHTML = markdownToHtml(deduplicateSections(streamedText.current));
          injectSpecialTeamsTable(editorRef.current);
          setHasContent(true);
        }

        // Finalise — store rendered HTML so the Special Teams table is preserved on reload
        const completed: GeneratedReport = { ...meta, content: editorRef.current?.innerHTML ?? streamedText.current };
        sessionStorage.removeItem(`report_pending_${id}`);
        sessionStorage.setItem(`report_${id}`, JSON.stringify(completed));
        const { saveToHistory } = await import("@/lib/history");
        saveToHistory(completed);
        setReport(completed);
      } catch (err) {
        // React Strict Mode (dev) double-fires effects and aborts the first fetch.
        // Don't treat an abort as a real error — the second effect handles the real fetch.
        wasAborted = err instanceof Error && err.name === "AbortError";
        if (!wasAborted) {
          console.error("[Stream]", err);
          if (editorRef.current) {
            editorRef.current.innerHTML = `<p style="color:#ff7070">⚠ Failed to generate report: ${err}</p>`;
          }
          setHasContent(true);
        }
      } finally {
        if (!wasAborted) setStreaming(false);
      }
    })();

    return () => { abortController.abort(); };
  }, [id]);

  // Populate editor for completed (non-streamed) reports once div is in DOM
  useEffect(() => {
    if (report?.content && !streaming && editorRef.current && !editorRef.current.innerHTML) {
      // Content may already be rendered HTML (new format) or raw markdown (old format)
      editorRef.current.innerHTML = report.content.trimStart().startsWith("<")
        ? report.content
        : markdownToHtml(deduplicateSections(report.content));
    }
  }, [report, streaming]);

  // Elapsed-time counter — drives phase labels in the loading overlay
  useEffect(() => {
    if (!streaming) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [streaming]);

  function buildSpecialTeamsTableHtml(input: ReportInput): string {
    const myTeam  = input.myTeamSide === "home" ? input.homeTeam  : input.awayTeam;
    const oppTeam = input.myTeamSide === "home" ? input.awayTeam  : input.homeTeam;
    const my  = input.myTeamStats;
    const opp = input.opponentStats;
    return `<div class="table-wrap"><table class="report-table"><thead><tr>` +
      `<th>Team</th><th>PP%</th><th>PK%</th><th>GF/G</th><th>GA/G</th>` +
      `</tr></thead><tbody><tr>` +
      `<td><strong>${myTeam.name}</strong></td>` +
      `<td>${my.powerPlayPct.toFixed(1)}%</td>` +
      `<td>${my.penaltyKillPct.toFixed(1)}%</td>` +
      `<td>${my.goalsForPerGame.toFixed(2)}</td>` +
      `<td>${my.goalsAgainstPerGame.toFixed(2)}</td>` +
      `</tr><tr>` +
      `<td><strong>${oppTeam.name}</strong></td>` +
      `<td>${opp.powerPlayPct.toFixed(1)}%</td>` +
      `<td>${opp.penaltyKillPct.toFixed(1)}%</td>` +
      `<td>${opp.goalsForPerGame.toFixed(2)}</td>` +
      `<td>${opp.goalsAgainstPerGame.toFixed(2)}</td>` +
      `</tr></tbody></table></div>`;
  }

  function injectSpecialTeamsTable(el: HTMLDivElement) {
    const input = reportInputRef.current;
    if (!input) return;

    // Find the Special Teams H2
    const h2s   = Array.from(el.querySelectorAll("h2"));
    const stH2  = h2s.find(h => /special teams/i.test(h.textContent ?? ""));
    if (!stH2) return;

    // Remove any tables already in the Special Teams section (before next H2)
    let node: Element | null = stH2.nextElementSibling;
    while (node && node.tagName !== "H2") {
      const next = node.nextElementSibling;
      if (node.classList.contains("table-wrap") || node.tagName === "TABLE") node.remove();
      node = next;
    }

    // Insert the pre-computed table — before the first H3, or right after the H2
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildSpecialTeamsTableHtml(input);
    const tableDiv = wrapper.firstElementChild!;
    const firstH3  = stH2.nextElementSibling;
    if (firstH3 && firstH3.tagName === "H3") {
      stH2.parentElement?.insertBefore(tableDiv, firstH3);
    } else {
      stH2.insertAdjacentElement("afterend", tableDiv);
    }
  }

  function deduplicateSections(md: string): string {
    // 0. Strip the closing line wherever it appears — we append it once via the API route.
    md = md.replace(/\*Dallas Stars Hockey Operations\s*[—–-]+\s*Internal Use Only\*[^\n]*/gi, "").trim();

    // 0a. Strip any trailing --- rules Claude added (we append our own single --- + closing line).
    md = md.replace(/(\n---+\s*)+$/g, "").trim();

    // 0d. Remove --- lines that appear between list items (Claude sometimes divides keys with a rule).
    //     Multi-line list items meant the old single-line regex missed them — this catches any ---
    //     whose next non-blank content is a list item (- or *), regardless of what precedes it.
    md = md.replace(/\n+---+\n+(?=[-*] )/g, "\n\n");

    // 0b. Strip angle-bracket placeholder text if Claude echoed template markers literally.
    md = md.replace(/^<[^>\n]{3,80}>\s*$/gm, "");

    // 0c. Normalize H2 headings to canonical section names.
    // If Claude bleeds content into a heading line (e.g. "## Our Strengths 28.5%..."),
    // map it back to the known section name. For opponent breakdowns, strip trailing numbers/words.
    const CANONICAL_H2: [RegExp, string][] = [
      [/^executive summary/i,           "Executive Summary"],
      [/^our strengths/i,               "Our Strengths"],
      [/^threat assessment/i,           "Threat Assessment"],
      [/^special teams review/i,        "Special Teams Review"],
      [/^special teams/i,               "Special Teams"],
      [/^deployment notes/i,            "Deployment Notes"],
      [/^win probability/i,             "Win Probability"],
      [/^keys to victory/i,             "Keys to Victory"],
      [/^result summary/i,              "Result Summary"],
      [/^what worked/i,                 "What Worked"],
      [/^what didn.t work/i,            "What Didn't Work"],
      [/^individual standouts/i,        "Individual Standouts"],
      [/^opponent assessment/i,         "Opponent Assessment Update"],
      [/^adjustments/i,                 "Adjustments for Next Game"],
      [/^takeaway/i,                    "Takeaway"],
    ];
    md = md.replace(/^## (.+)$/gm, (_, title) => {
      for (const [pattern, canonical] of CANONICAL_H2) {
        if (pattern.test(title.trim())) return `## ${canonical}`;
      }
      // For opponent breakdown: keep only "Team Name Breakdown", strip trailing junk
      const bdMatch = title.match(/^(.+?\s+breakdown)/i);
      if (bdMatch) return `## ${bdMatch[1]}`;
      // Clip any other heading that's too long at first punctuation
      if (title.length > 45) {
        const clipped = title.split(/[,:.—–]/)[0].trim();
        return `## ${clipped}`;
      }
      return `## ${title}`;
    });

    // 1. Strip duplicate H1 titles and italic-only subtitle lines — keep only first occurrence
    const topLevelSeen = new Set<string>();
    const lines = md.split("\n").filter(line => {
      const trimmed = line.trim();
      // H1 headers
      const h1 = trimmed.match(/^# (.+)$/);
      if (h1) {
        const key = h1[1].trim().toLowerCase();
        if (topLevelSeen.has(key)) return false;
        topLevelSeen.add(key);
        return true;
      }
      // Italic-only lines (subtitle like *2026-04-13 · Away*)
      if (/^\*[^*\n]+\*$/.test(trimmed)) {
        const key = trimmed.toLowerCase();
        if (topLevelSeen.has(key)) return false;
        topLevelSeen.add(key);
      }
      return true;
    });
    md = lines.join("\n");

    // 2. Fix mid-line heading markers — e.g. "Dallas## Executive Summary" → two lines
    md = md.replace(/^(?!#)([^|\n]+?)(#{1,4} [^\n]+)$/gm, (_, before, heading) =>
      before.trimEnd() + "\n" + heading
    );

    // 3. Strip any preamble paragraphs before the first ## section header.
    // Only H1, italic subtitles, and blank lines are valid before the first section.
    const firstSectionIdx = md.search(/^## /m);
    if (firstSectionIdx > 0) {
      const header = md.slice(0, firstSectionIdx);
      const cleanHeader = header.split("\n")
        .filter(l => /^#+ /.test(l) || /^\*[^*\n]+\*$/.test(l.trim()) || l.trim() === "")
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
      md = cleanHeader + md.slice(firstSectionIdx);
    }

    // 5. Deduplicate H2 sections — keep longest version of each
    const h2Parts = md.split(/(?=^## )/m);
    const h2Seen = new Map<string, string>();
    for (const part of h2Parts) {
      const key = part.match(/^## (.+?)$/m)?.[1]?.trim().toLowerCase() ?? "__preamble__";
      if (!h2Seen.has(key) || part.length > (h2Seen.get(key)?.length ?? 0)) {
        h2Seen.set(key, part);
      }
    }
    // 5b. Remove empty H2 sections (heading with no content — fixes phantom headings like
    //     "## TORONTO MAPLE LEAFS" appearing before "## TORONTO MAPLE LEAFS BREAKDOWN")
    md = Array.from(h2Seen.entries())
      .filter(([key, part]) => {
        if (key === "__preamble__") return true;
        const headingLine = part.match(/^## [^\n]+/)?.[0] ?? "";
        const body = part.slice(headingLine.length).trim();
        return body.length > 0;
      })
      .map(([, part]) => part)
      .join("");

    // 6. Within each H2 block, deduplicate H3 sub-sections — keep longest version
    md = md.split(/(?=^## )/m).map(section => {
      const h3Parts = section.split(/(?=^### )/m);
      const h3Seen = new Map<string, string>();
      for (const part of h3Parts) {
        const key = part.match(/^### (.+?)$/m)?.[1]?.trim().toLowerCase() ?? "__h2preamble__";
        if (!h3Seen.has(key) || part.length > (h3Seen.get(key)?.length ?? 0)) {
          h3Seen.set(key, part);
        }
      }
      return Array.from(h3Seen.values()).join("");
    }).join("");

    return md;
  }

  function inlineFormat(text: string): string {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      // Strip any remaining unmatched ** or * markers (mid-stream or malformed)
      .replace(/\*{2,}/g, "")
      .replace(/(?<=[^a-zA-Z0-9])\*(?=[^a-zA-Z0-9])/g, "");
  }

  function markdownToHtml(md: string): string {
    const lines = md.split("\n");
    const out: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const raw  = lines[i];
      const line = raw.trim();

      // Empty line
      if (!line) { i++; continue; }

      // Horizontal rule
      if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
        out.push('<hr class="section-rule">');
        i++; continue;
      }

      // Headings
      const h1 = line.match(/^# (.+)$/);
      if (h1) { out.push(`<h1>${inlineFormat(h1[1])}</h1>`); i++; continue; }
      const h2 = line.match(/^## (.+)$/);
      if (h2) {
        // Suppress the Executive/Result Summary heading — content flows directly after the title
        if (/^(executive summary|result summary)$/i.test(h2[1].trim())) { i++; continue; }
        out.push(`<h2>${inlineFormat(h2[1])}</h2>`);
        i++; continue;
      }
      const h3 = line.match(/^### (.+)$/);
      if (h3) { out.push(`<h3>${inlineFormat(h3[1])}</h3>`); i++; continue; }
      const h4 = line.match(/^#### (.+)$/);
      if (h4) { out.push(`<h4>${inlineFormat(h4[1])}</h4>`); i++; continue; }

      // Table — header row | separator row pattern
      if (line.startsWith("|")) {
        let sepIdx = i + 1;
        while (sepIdx < lines.length && !lines[sepIdx].trim()) sepIdx++;
        if (sepIdx < lines.length && /^\|[\s\-:|]+\|/.test(lines[sepIdx].trim())) {
          const headerCells = line.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
          const bodyRows: string[][] = [];
          let j = i + 2; // skip separator
          while (j < lines.length && lines[j].trim().startsWith("|")) {
            bodyRows.push(lines[j].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
            j++;
          }
          let html = '<div class="table-wrap"><table class="report-table"><thead><tr>';
          headerCells.forEach(h => { html += `<th>${inlineFormat(h)}</th>`; });
          html += "</tr></thead><tbody>";
          bodyRows.forEach(row => {
            html += "<tr>";
            row.forEach(cell => { html += `<td>${inlineFormat(cell)}</td>`; });
            html += "</tr>";
          });
          html += "</tbody></table></div>";
          out.push(html);
          i = j; continue;
        }
      }

      // Unordered list
      if (/^[-*] /.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
          items.push(`<li>${inlineFormat(lines[i].trim().replace(/^[-*] /, ""))}</li>`);
          i++;
        }
        out.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\d+\. /.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
          items.push(`<li>${inlineFormat(lines[i].trim().replace(/^\d+\. /, ""))}</li>`);
          i++;
        }
        out.push(`<ol>${items.join("")}</ol>`);
        continue;
      }

      // Blockquote
      if (line.startsWith(">")) {
        out.push(`<blockquote>${inlineFormat(line.replace(/^>\s*/, ""))}</blockquote>`);
        i++; continue;
      }

      // Paragraph
      out.push(`<p>${inlineFormat(line)}</p>`);
      i++;
    }

    return out.join("\n");
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
          {streaming && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--accent-bright)" }}>
              <Spinner />
              Generating...
            </span>
          )}
          {!streaming && saveStatus !== "idle" && saveStatus !== "exporting" && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--accent-bright)" }}>
              {saveStatus === "saved" ? "✓ Saved" : "✓ Copied"}
            </span>
          )}
          <TBtn onClick={handleSave}  label="Save"     disabled={streaming} />
          <TBtn onClick={handleCopy}  label="Copy"     disabled={streaming} />
          <TBtn onClick={handleDocx}  label={saveStatus === "exporting" ? "Exporting..." : "Export .docx"} disabled={streaming} />
          <TBtn onClick={() => window.print()} label="Print / PDF" accent disabled={streaming} />
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

        {streaming && !hasContent && (
          <LoadingOverlay
            elapsed={elapsed}
            myTeam={report.myTeam}
            opponent={report.opponent}
          />
        )}

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
            display: streaming && !hasContent ? "none" : undefined,
          }}
        />

        <p className="no-print" style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--text-dim)", textAlign: "center", marginTop: "1.25rem" }}>
          Click inside to edit · Auto-saves on click-away · Export as .docx or Print to PDF
        </p>
      </main>

      <style suppressHydrationWarning>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* ── Report content typography ── */
        /* h1 = document title (# Pre-Game Report: ...) */
        .report-editor h1 {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text);
          margin: 0 0 0.15rem;
          line-height: 1.1;
        }
        /* h2 = section headers (## Executive Summary) */
        .report-editor h2 {
          font-family: var(--font-display);
          font-size: 1.05rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--accent-bright);
          border-bottom: 2px solid rgba(0,104,71,0.35);
          padding-bottom: 0.4rem;
          margin: 2.5rem 0 0.85rem;
        }
        .report-editor h2:first-of-type { margin-top: 2.5rem; }
        /* h3 = sub-headers (### What they do well) */
        .report-editor h3 {
          font-family: var(--font-display);
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--gold);
          margin: 1.5rem 0 0.5rem;
        }
        .report-editor h4 {
          font-family: var(--font-display);
          font-size: 0.62rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
          margin: 0.9rem 0 0.3rem;
        }
        .report-editor p {
          font-family: var(--font-body);
          font-size: 0.915rem;
          color: var(--text);
          line-height: 1.8;
          margin: 0 0 0.7rem;
        }
        .report-editor strong {
          font-weight: 700;
          color: var(--text);
        }
        .report-editor em {
          font-style: italic;
          color: var(--text-muted);
        }
        .report-editor code {
          font-family: var(--font-mono);
          font-size: 0.82rem;
          background: rgba(0,104,71,0.1);
          color: var(--accent-bright);
          padding: 1px 6px;
          border-radius: 3px;
          border: 1px solid rgba(0,104,71,0.2);
        }
        .report-editor blockquote {
          border-left: 3px solid var(--accent);
          margin: 0.75rem 0;
          padding: 0.4rem 0 0.4rem 1rem;
          color: var(--text-muted);
          font-style: italic;
          font-size: 0.88rem;
        }
        .report-editor hr.section-rule {
          border: none;
          border-top: 1px solid var(--border);
          margin: 1.75rem 0;
        }

        /* ── Lists ── */
        .report-editor ul {
          list-style-type: disc;
          margin: 0.25rem 0 0.85rem 0;
          padding: 0 0 0 1.25rem;
        }
        .report-editor ol {
          list-style-type: decimal;
          margin: 0.25rem 0 0.85rem 0;
          padding: 0 0 0 1.25rem;
        }
        .report-editor li {
          font-family: var(--font-body);
          font-size: 0.915rem;
          color: var(--text);
          line-height: 1.8;
          margin-bottom: 0.55rem;
        }
        .report-editor ul li::marker { color: var(--accent-bright); }
        .report-editor ol li::marker { color: var(--accent-bright); font-weight: 700; font-family: var(--font-mono); font-size: 0.8rem; }

        /* ── Tables ── */
        .report-editor .table-wrap {
          overflow-x: auto;
          margin: 0.75rem 0 1.25rem;
          border-radius: 6px;
          border: 1px solid var(--border);
        }
        .report-editor .report-table {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-mono);
          font-size: 0.8rem;
        }
        .report-editor .report-table th {
          background: rgba(0,104,71,0.12);
          color: var(--accent-bright);
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 0.55rem 1rem;
          text-align: left;
          border-bottom: 1px solid rgba(0,104,71,0.25);
          white-space: nowrap;
        }
        .report-editor .report-table td {
          padding: 0.45rem 1rem;
          color: var(--text);
          border-bottom: 1px solid var(--border);
        }
        .report-editor .report-table tr:last-child td { border-bottom: none; }
        .report-editor .report-table tbody tr:hover td { background: rgba(255,255,255,0.02); }

        /* ── Print ── */
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          .report-editor {
            background: white !important; border: none !important;
            padding: 0 !important; box-shadow: none !important;
          }
          .report-editor h1 { color: #000 !important; font-size: 1.4rem !important; }
          .report-editor h2 { color: #006847 !important; border-bottom-color: #bbb !important; font-size: 0.95rem !important; }
          .report-editor h3 { color: #7a6200 !important; font-size: 0.72rem !important; }
          .report-editor h4 { color: #555 !important; }
          .report-editor p, .report-editor li { color: #222 !important; font-size: 0.85rem !important; }
          .report-editor em { color: #555 !important; }
          .report-editor strong { color: #000 !important; }
          .report-editor hr.section-rule { border-top-color: #ddd !important; }
          .report-editor .table-wrap { border-color: #ddd !important; }
          .report-editor .report-table th {
            background: #f0f7f4 !important;
            color: #006847 !important;
            border-bottom-color: #ccc !important;
          }
          .report-editor .report-table td { color: #333 !important; border-bottom-color: #eee !important; }
          .report-editor code { background: #f5f5f5 !important; color: #006847 !important; border-color: #ddd !important; }
          .report-editor blockquote { border-left-color: #006847 !important; color: #555 !important; }
          /* Prevent orphaned headers and bisected content */
          .report-editor h2, .report-editor h3 { break-after: avoid; page-break-after: avoid; }
          .report-editor h2 { break-before: auto; page-break-before: auto; }
          .report-editor .table-wrap { break-inside: avoid; page-break-inside: avoid; }
          .report-editor li { break-inside: avoid; page-break-inside: avoid; }
          .report-editor hr.section-rule { break-after: avoid; page-break-after: avoid; }
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

function LoadingOverlay({ elapsed, myTeam, opponent }: { elapsed: number; myTeam: string; opponent: string }) {
  const progress = elapsed < 65
    ? Math.round((elapsed / 65) * 70)
    : elapsed < 78
    ? Math.round(70 + ((elapsed - 65) / 13) * 15)
    : Math.min(99, Math.round(85 + ((elapsed - 78) / 30) * 14));
  const phase = elapsed < 65 ? "Generating report..." : elapsed < 78 ? "Validating..." : "Applying corrections...";
  return (
    <div style={{
      minHeight: "65vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "2rem",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "10px", boxShadow: "0 0 40px rgba(0,0,0,0.3)",
    }}>
      <Spinner size={22} />
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1rem", color: "var(--text)", letterSpacing: "0.02em" }}>
          {myTeam.toUpperCase()} VS {opponent.toUpperCase()}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--accent-bright)" }}>
          {phase}
        </span>
        <div style={{ width: "180px", height: "3px", background: "var(--border)", borderRadius: "2px", margin: "0.25rem auto 0" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent-bright)", borderRadius: "2px", transition: "width 0.8s ease" }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--text-dim)" }}>
          {progress}%
        </span>
      </div>
    </div>
  );
}

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "spin 0.75s linear infinite", color: "var(--text-muted)" }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function TBtn({ onClick, label, accent, disabled }: { onClick: () => void; label: string; accent?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "0.35rem 0.8rem",
      background: accent ? "var(--accent)" : "var(--surface-2)",
      color: accent ? "#fff" : "var(--text-muted)",
      border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
      borderRadius: "4px", fontFamily: "var(--font-display)", fontWeight: 700,
      fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase",
      cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.12s",
      boxShadow: accent ? "0 0 10px rgba(0,104,71,0.2)" : "none",
      opacity: disabled ? 0.4 : 1,
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
