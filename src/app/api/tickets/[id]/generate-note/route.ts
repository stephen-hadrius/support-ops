import { NextRequest, NextResponse } from "next/server";
import { getTicket, getAnalysis, getTicketMessages } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { publicErrorMessage } from "@/lib/errors";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const ticket = getTicket(id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const analysis = getAnalysis(id);
  const messagesRow = getTicketMessages(id);

  const aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const SYSTEM_PROMPT = `You are a support operations AI assistant. The user wants to add an internal note to Pylon ticket #${ticket.number}. 
Generate a short, helpful internal note that pushes the ticket forward based on its current context.

Guidelines:
- If a Linear ticket is linked and resolved, mention it's ready to tell the customer.
- If the ticket needs follow-up from another team, write a short summary they can read to catch up.
- If the ticket is being closed, write a very brief summary of the resolution.
- Keep the note concise, professional, and directly actionable (max 3-4 sentences). 
- Return ONLY the draft internal note text, with no wrapping quotes, markdown formatting, or preamble.`;

  const userContent = `Ticket #${ticket.number} — "${ticket.title}"
State: ${ticket.state}

AI Triage Verdict: ${analysis?.verdict ?? "None"}
Customer Needs: ${analysis?.what_customer_needs ?? "Unknown"}
AI Context/Reasoning: ${analysis?.why ?? "Unknown"}

Messages:
${messagesRow?.messages_json ? (() => {
  try {
    const parsed = JSON.parse(messagesRow.messages_json);
    return parsed.slice(-5).map((m: any) => `[${m.is_private ? "INTERNAL" : "PUBLIC"}] ${m.from_customer ? "Customer" : "Support"}: ${m.body_html?.replace(/<[^>]+>/g, " ")}`).join("\n\n");
  } catch (e) {
    return "(unparseable messages)";
  }
})() : "(no messages cached)"}
`;

  try {
    const response = await aiClient.models.generateContent({
      model: process.env.ANALYSIS_MODEL ?? "gemini-3.5-flash",
      contents: userContent,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Model returned empty content");
    }

    return NextResponse.json({ note: text });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, "Failed to generate note") }, { status: 500 });
  }
}
