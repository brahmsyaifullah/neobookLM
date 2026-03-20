import { NextRequest, NextResponse } from "next/server";
import { geminiFlash, geminiPro, embedText } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { message, topicId, useProModel = false } = await req.json();

  if (!message || !topicId) {
    return NextResponse.json({ error: "message and topicId required" }, { status: 400 });
  }

  try {
    // 1. Embed the user's query
    const queryEmbedding = await embedText(message);

    // 2. Retrieve top-k relevant chunks via RPC
    const { data: chunks, error } = await supabase.rpc("match_documents", {
      query_embedding: queryEmbedding,
      filter_topic_id: topicId,
      match_count: 8,
      match_threshold: 0.5,
    });

    if (error) throw error;

    // 3. Build context string from chunks
    const context = chunks
      ?.map((c: any, i: number) =>
        `[Source ${i + 1}: ${c.metadata?.title ?? c.source_url}]\n${c.content}`
      )
      .join("\n\n---\n\n") ?? "No relevant context found.";

    // 4. Build system prompt
    const systemPrompt = `You are a research assistant. Answer the user's question based ONLY on the provided context below.
Always cite which source you're drawing from. If the context doesn't contain enough information, say so clearly.

CONTEXT:
${context}`;

    // 5. Call Gemini
    const model = useProModel ? geminiPro : geminiFlash;
    const result = await model.generateContent({
      systemInstruction: systemPrompt,
      contents: [{ role: "user", parts: [{ text: message }] }],
    });

    const answer = result.response.text();
    const sources = [...new Set(chunks?.map((c: any) => c.source_url) ?? [])];

    return NextResponse.json({ answer, sources });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
