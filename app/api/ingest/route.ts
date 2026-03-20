import { NextRequest, NextResponse } from "next/server";
import Hyperbrowser from "@hyperbrowser/sdk";
import { embedText } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";

const client = new Hyperbrowser({ apiKey: process.env.HYPERBROWSER_API_KEY! });

// Chunk text into ~800 token pieces with 100 token overlap
function chunkText(text: string, chunkSize = 3200, overlap = 400): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = start + chunkSize;
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  const { keyword, sources } = await req.json();
  // sources: [{ url, title }] — max 5

  if (!keyword || !sources?.length) {
    return NextResponse.json({ error: "keyword and sources required" }, { status: 400 });
  }

  try {
    // 1. Create or retrieve topic
    const slug = keyword.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data: existingTopic } = await supabase
      .from("topics")
      .select("id")
      .eq("slug", slug)
      .single();

    let topicId: string;

    if (existingTopic) {
      topicId = existingTopic.id;
    } else {
      const { data: newTopic, error } = await supabase
        .from("topics")
        .insert({ slug, title: keyword })
        .select("id")
        .single();
      if (error) throw error;
      topicId = newTopic.id;
    }

    // 2. Scrape all sources in parallel
    const scraped = await Promise.allSettled(
      sources.map(async (source: { url: string; title: string }) => {
        const result = await client.scrape.startAndWait({ url: source.url });
        return { ...source, text: result.data?.markdown ?? result.data?.html ?? "" };
      })
    );

    // 3. For each scraped source, chunk + embed + store
    for (const item of scraped) {
      if (item.status === "rejected") continue;
      const { url, title, text } = item.value;

      if (!text.trim()) continue;

      // Insert source record
      const { data: sourceRecord, error: srcErr } = await supabase
        .from("sources")
        .insert({ topic_id: topicId, url, title, raw_text: text })
        .select("id")
        .single();
      if (srcErr) continue;

      // Chunk and embed
      const chunks = chunkText(text);
      for (const chunk of chunks) {
        const embedding = await embedText(chunk);
        await supabase.from("documents").insert({
          topic_id: topicId,
          source_id: sourceRecord.id,
          content: chunk,
          embedding,
          metadata: { url, title },
        });
      }
    }

    return NextResponse.json({ success: true, topicId, slug });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
