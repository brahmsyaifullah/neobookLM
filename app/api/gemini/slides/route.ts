import { NextRequest, NextResponse } from "next/server";
import { geminiImage } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { topic, content } = await req.json();

  try {
    const prompt = `Create a professional presentation slide for the topic: "${topic}".
Content to visualize: ${content}
Return a clean, visually structured layout description with key points as a JSON object with fields: title, bullets (array), imagePrompt (string for background imagery).`;

    const result = await geminiImage.generateContent(prompt);
    const raw = result.response.text();

    // Strip markdown fences if present
    const clean = raw.replace(/```json|```/g, "").trim();
    const slide = JSON.parse(clean);

    return NextResponse.json({ slide });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
