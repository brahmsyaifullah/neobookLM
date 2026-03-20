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

    const prompt = `You produce concise mindmaps. Output ONLY valid JSON with this EXACT structure: {"root": {"title": "Main Topic", "children": [{"title": "Subtopic 1"}, {"title": "Subtopic 2", "children": [{"title": "Detail"}]}]}}. EVERY node MUST have a "title" string property. Keep hierarchy shallow (max 3 levels) and informative.
    
    EXTRACTS:
    ${content}`;

    const result = await geminiFlash.generateContent(prompt);
    let rawContent = result.response.text();
    
    // Cleanup markdown code blocks if present (more robust regex)
    rawContent = rawContent.replace(/```json\s*|\s*```/g, "").trim();

    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    } catch (e) {
        console.error("Failed to parse JSON:", rawContent);
        throw new Error("Failed to parse Gemini response as JSON");
    }
    
    // Handle case where root object is returned directly or wrapped in "root"
    let rootNode = parsed.root || parsed;
    if (rootNode.title && !rootNode.children) {
        rootNode.children = [];
    }

    // Ensure root node has proper structure
    if (!rootNode || !rootNode.title) {
      console.error("[Mindmap] Invalid root structure:", parsed);
      throw new Error("Invalid mindmap structure returned from Gemini");
    }

    return NextResponse.json({
      notebookId,
      generatedAt: Date.now(),
      root: rootNode,
    });
  } catch (error) {
    console.error("Mindmap generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
