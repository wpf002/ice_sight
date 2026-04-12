import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildReportPrompt } from "@/lib/report";
import { ReportInput } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const input: ReportInput = await req.json();
    const prompt = buildReportPrompt(input);

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response type from Claude" }, { status: 500 });
    }

    return NextResponse.json({ report: content.text });
  } catch (err) {
    console.error("[Report API]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
