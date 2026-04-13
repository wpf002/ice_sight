import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildReportPrompt } from "@/lib/report";
import { ReportInput } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a veteran NHL analytics coach. You write internal pre-game and post-game scouting documents for the Dallas Stars coaching staff.

Absolute rules:
- The report title and subtitle have already been written. Your response begins DIRECTLY with the first section header (## Executive Summary or ## Result Summary). Zero preamble. Zero title. Zero "Here is".
- Write each section ONCE. Never repeat a heading or section.
- Bold key numbers and names: **28.5%**, **Auston Matthews**, **4-1 run**
- Direct voice only. Forbidden: "it's worth noting", "this suggests", "looking at the data", "importantly", "it is clear that"
- State conclusions. Never hedge.
- Use ## for section headers, ### for sub-headers
- Separate major sections with --- on its own line
- NEVER create markdown tables. The only table in the report is the Special Teams one, which is pre-computed and provided to you verbatim — copy it exactly as given, make no changes to it.
- Always include "per game" when citing a per-game rate (e.g. "3.08 goals for per game", never "3.08 goals for").
- Never cite a stat to support a conclusion it doesn't logically support. If a claim can't be backed by the numbers provided, state it without a stat.
- Zone specificity: never mix up "neutral zone" and "defensive zone" in the same clause. Pick the correct zone for the action described.
- Every claim that needs an article gets one: "a secondary concern", "a volume of opportunities" — never drop the article before a noun phrase.`;

export async function POST(req: NextRequest) {
  const input: ReportInput = await req.json();
  const { prompt, titlePrefill } = buildReportPrompt(input);

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    temperature: 0,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        // Emit the prefill first so the client has the complete document
        // (add \n\n here since Anthropic rejects trailing whitespace in the prefill message)
        controller.enqueue(encoder.encode(titlePrefill + "\n\n"));
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        // Append closing line — never ask Claude to produce it (causes mid-report echoes)
        controller.enqueue(encoder.encode("\n\n---\n\n*Dallas Stars Hockey Operations — Internal Use Only*"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
