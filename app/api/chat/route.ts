import { NextRequest, NextResponse } from "next/server";
import { geminiFlash, geminiPro, embedText } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { message, messages, topicId, context: providedContext, useProModel = false } = await req.json();

  // Handle both single message and conversation history
  const lastMessage = message || (messages && messages[messages.length - 1]?.content);

  if (!lastMessage) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    let context = providedContext || "";

    // If topicId is provided, use RAG from Supabase
    if (topicId && !providedContext) {
      // 1. Embed the user's query
      const queryEmbedding = await embedText(lastMessage);

      // 2. Retrieve top-k relevant chunks via RPC
      const { data: chunks, error } = await supabase.rpc("match_documents", {
        query_embedding: queryEmbedding,
        filter_topic_id: topicId,
        match_count: 8,
        match_threshold: 0.5,
      });

      if (!error && chunks) {
        context = chunks
          .map((c: any, i: number) =>
            `[Source ${i + 1}: ${c.metadata?.title ?? c.source_url}]\n${c.content}`
          )
          .join("\n\n---\n\n");
      }
    }

    if (!context) {
        context = "No relevant context found.";
    }

    // 4. Build system prompt
    const systemPrompt = `You are a research assistant. Answer the user's question based ONLY on the provided context below.
Always cite which source you're drawing from. If the context doesn't contain enough information, say so clearly.

CONTEXT:
${context}`;

    // 5. Call Gemini
    // Use geminiFlash by default as requested (Pro is overkill)
    const model = useProModel ? geminiPro : geminiFlash;
    
    // Support streaming as expected by the UI
    const result = await model.generateContentStream({
      systemInstruction: systemPrompt,
      contents: messages 
        ? messages.map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        : [{ role: "user", parts: [{ text: lastMessage }] }],
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(new TextEncoder().encode(text));
          }
        }
        controller.close();
      },
    });

    return new Response(stream);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
