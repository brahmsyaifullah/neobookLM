import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = (globalThis as any).GEMINI_API_KEY;
const SUPABASE_URL = (globalThis as any).SUPABASE_URL;
const SUPABASE_SERVICE_KEY = (globalThis as any).SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Embed via Gemini REST (Workers don't support Node SDK)
async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    }
  );
  const data: any = await res.json();
  return data.embedding.values;
}

// MCP Tool definitions
const TOOLS = [
  {
    name: "search_knowledge_base",
    description: "Search the team's research knowledge base by topic. Returns relevant code patterns, documentation, and best practices.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        topic_slug: { type: "string", description: "Optional topic filter (e.g. cloudflare-durable-objects)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_topics",
    description: "List all available research topics in the knowledge base.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleTool(name: string, args: any): Promise<string> {
  if (name === "list_topics") {
    const { data } = await supabase.from("topics").select("slug, title, created_at").order("created_at", { ascending: false });
    return JSON.stringify(data ?? []);
  }

  if (name === "search_knowledge_base") {
    const { query, topic_slug } = args;

    // Get topic_id if slug provided
    let topicId: string | null = null;
    if (topic_slug) {
      const { data } = await supabase.from("topics").select("id").eq("slug", topic_slug).single();
      topicId = data?.id ?? null;
    }

    const embedding = await embedQuery(query);

    let rpcArgs: any = { query_embedding: embedding, match_count: 6, match_threshold: 0.45 };
    if (topicId) rpcArgs.filter_topic_id = topicId;

    const { data: chunks } = await supabase.rpc("match_documents", rpcArgs);

    if (!chunks?.length) return "No relevant content found for this query.";

    return chunks
      .map((c: any, i: number) =>
        `## Result ${i + 1}\nSource: ${c.source_url}\nSimilarity: ${(c.similarity * 100).toFixed(1)}%\n\n${c.content}`
      )
      .join("\n\n---\n\n");
  }

  return "Unknown tool";
}

// Cloudflare Worker fetch handler (MCP over HTTP-SSE)
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    // Inject env into globalThis for the functions above
    (globalThis as any).GEMINI_API_KEY = env.GEMINI_API_KEY;
    (globalThis as any).SUPABASE_URL = env.SUPABASE_URL;
    (globalThis as any).SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/mcp") {
      // MCP capability discovery
      return Response.json({
        name: "hyperbooklm-knowledge-base",
        version: "1.0.0",
        tools: TOOLS,
      });
    }

    if (request.method === "POST" && url.pathname === "/mcp/call") {
      const body: any = await request.json();
      const result = await handleTool(body.tool, body.args ?? {});
      return Response.json({ result });
    }

    return new Response("HyperbookLM MCP Server", { status: 200 });
  },
};
