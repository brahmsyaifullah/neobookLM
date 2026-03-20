import { NextRequest, NextResponse } from "next/server";
import { Source } from "@/lib/types";
import { geminiFlash } from "@/lib/gemini";

function buildContentFromSources(sources: Source[], maxChars = 4000) {
  const payload = sources
    .filter((s) => s.status === "success" && (s.text || s.content))
    .map((s, idx) => {
      const text = (s.text || s.content || "").slice(0, maxChars);
      return `[Source ${idx + 1}] ${s.title ?? s.url}\n${text}`;
    })
    .join("\n\n");
  if (!payload) {
    throw new Error("No source text available for generation.");
  }
  return payload;
}

export async function POST(request: NextRequest) {
  try {
    const { notebookId, sources } = await request.json();

    const content = buildContentFromSources(sources, 4000);

    const prompt = `You summarize user-provided extracts. Respond with JSON {"bullets": string[], "keyStats": string[]}. Be concise, bullet-first, cite source numbers like (Source 1).
    
    EXTRACTS:
    ${content}`;

    const result = await geminiFlash.generateContent(prompt);
    const rawResponse = result.response.text();
    
    // Clean markdown if present
    const cleanJson = rawResponse.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    return NextResponse.json({
      notebookId,
      generatedAt: Date.now(),
      bullets: parsed.bullets || [],
      keyStats: parsed.keyStats || [],
    });
  } catch (error) {
    console.error("Overview generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
