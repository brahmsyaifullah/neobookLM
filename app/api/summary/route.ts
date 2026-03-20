import { geminiFlash } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { context } = await request.json();
    
    if (!context) {
      return NextResponse.json({ summary: "No content to summarize." });
    }

    const systemPrompt = "You are an expert research assistant. Analyze the provided context and provide a comprehensive summary. \n\nStructure:\n1. A brief 1-2 sentence overview.\n2. 3-5 key bullet points highlighting the most important facts or insights.\n3. A concluding sentence.\n\nKeep it professional, concise, and easy to read.";

    const result = await geminiFlash.generateContent({
      systemInstruction: systemPrompt,
      contents: [{ role: "user", parts: [{ text: `Context:\n${context}` }] }],
    });

    const summary = result.response.text();
    
    if (!summary) {
      console.error("[Summary] Empty response from Gemini");
      throw new Error("Gemini returned empty summary content");
    }
    
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("[Summary] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
