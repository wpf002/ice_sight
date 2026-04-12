import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType,
} from "docx";
import { saveAs } from "file-saver";
import { GeneratedReport } from "@/types";

// ── Parse the editor HTML into a block list ────────────────────────────────
interface Block {
  type: "h1" | "h2" | "h3" | "p" | "li";
  text: string;
}

function parseHtml(html: string): Block[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const blocks: Block[] = [];

  function walk(node: Element) {
    const tag = node.tagName?.toLowerCase();
    const text = node.textContent?.trim() ?? "";
    if (!text) return;

    if (tag === "h1") blocks.push({ type: "h1", text });
    else if (tag === "h2") blocks.push({ type: "h2", text });
    else if (tag === "h3") blocks.push({ type: "h3", text });
    else if (tag === "li") blocks.push({ type: "li", text });
    else if (tag === "p")  blocks.push({ type: "p",  text });
    else node.childNodes.forEach((c) => { if (c.nodeType === 1) walk(c as Element); });
  }

  div.childNodes.forEach((c) => { if (c.nodeType === 1) walk(c as Element); });
  return blocks;
}

// ── Convert blocks to docx Paragraphs ─────────────────────────────────────
function blocksToParagraphs(blocks: Block[]): Paragraph[] {
  const paras: Paragraph[] = [];

  for (const b of blocks) {
    switch (b.type) {
      case "h1":
        paras.push(new Paragraph({
          text: b.text,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 120 },
        }));
        break;

      case "h2":
        paras.push(new Paragraph({
          text: b.text,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 360, after: 120 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "006847", space: 4 },
          },
        }));
        break;

      case "h3":
        paras.push(new Paragraph({
          children: [new TextRun({ text: b.text, bold: true, color: "C8A84B", size: 20 })],
          spacing: { before: 240, after: 80 },
        }));
        break;

      case "li":
        paras.push(new Paragraph({
          text: b.text,
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
        }));
        break;

      case "p":
      default:
        paras.push(new Paragraph({
          children: [new TextRun({ text: b.text, size: 22 })],
          spacing: { before: 0, after: 120 },
          alignment: AlignmentType.JUSTIFIED,
        }));
        break;
    }
  }

  return paras;
}

// ── Header table (team vs team) ────────────────────────────────────────────
function makeHeaderTable(report: GeneratedReport): Table {
  const cellStyle = {
    shading: { type: ShadingType.SOLID, color: "050708", fill: "050708" },
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
  };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            ...cellStyle,
            children: [new Paragraph({
              children: [new TextRun({ text: report.myTeam.toUpperCase(), bold: true, color: "FFFFFF", size: 28 })],
              alignment: AlignmentType.CENTER,
            })],
          }),
          new TableCell({
            ...cellStyle,
            children: [new Paragraph({
              children: [new TextRun({ text: "VS", bold: true, color: "C8A84B", size: 32 })],
              alignment: AlignmentType.CENTER,
            })],
          }),
          new TableCell({
            ...cellStyle,
            children: [new Paragraph({
              children: [new TextRun({ text: report.opponent.toUpperCase(), bold: true, color: "AAAAAA", size: 28 })],
              alignment: AlignmentType.CENTER,
            })],
          }),
        ],
      }),
    ],
  });
}

// ── Main export function ───────────────────────────────────────────────────
export async function exportToDocx(report: GeneratedReport, editorHtml: string): Promise<void> {
  const blocks = parseHtml(editorHtml);
  const contentParagraphs = blocksToParagraphs(blocks);

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          run: { size: 40, bold: true, color: "006847", font: "Calibri" },
          paragraph: { spacing: { before: 0, after: 120 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          run: { size: 28, bold: true, color: "006847", font: "Calibri" },
          paragraph: { spacing: { before: 360, after: 120 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 900, right: 900 },
          },
        },
        children: [
          // Header metadata
          new Paragraph({
            children: [
              new TextRun({ text: "DALLAS STARS ANALYTICS  ·  ", bold: true, color: "006847", size: 18 }),
              new TextRun({ text: report.reportType === "pregame" ? "PRE-GAME SCOUTING REPORT" : "POST-GAME DEBRIEF", bold: true, color: "888888", size: 18 }),
              new TextRun({ text: `  ·  ${report.gameDate}`, color: "888888", size: 18 }),
            ],
            spacing: { after: 240 },
          }),

          // Team vs team header
          makeHeaderTable(report),

          // Spacer
          new Paragraph({ text: "", spacing: { before: 360 } }),

          // Report content
          ...contentParagraphs,

          // Footer note
          new Paragraph({
            children: [new TextRun({
              text: `Generated ${new Date(report.createdAt).toLocaleString()} · IceSight Analytics · Confidential`,
              color: "AAAAAA", size: 16, italics: true,
            })],
            spacing: { before: 480 },
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${report.myTeam.replace(/\s+/g, "_")}_vs_${report.opponent.replace(/\s+/g, "_")}_${report.gameDate}_${report.reportType}.docx`;
  saveAs(blob, filename);
}
