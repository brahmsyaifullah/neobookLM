import { NextRequest, NextResponse } from "next/server";
import Hyperbrowser from "@hyperbrowser/sdk";

const client = new Hyperbrowser({ apiKey: process.env.HYPERBROWSER_API_KEY! });

export async function POST(req: NextRequest) {
  const { keyword } = await req.json();

  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  try {
    // Use Hyperbrowser web search to get top 5 trusted sources
    const results = await client.web.search({
      query: keyword,
      // Returns: { data: { results: [{ url, title, description }] } }
    });

    return NextResponse.json({ sources: results.data?.results ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
