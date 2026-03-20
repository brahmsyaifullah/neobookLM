import { NextRequest, NextResponse } from "next/server";
import Hyperbrowser from "@hyperbrowser/sdk";
import { JSDOM } from "jsdom";

const client = new Hyperbrowser({ apiKey: process.env.HYPERBROWSER_API_KEY! });

export async function POST(req: NextRequest) {
  const { keyword } = await req.json();

  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  try {
    let results;
    // Use Hyperbrowser web search to get top 5 trusted sources
    if (typeof (client as any).search === 'function') {
      results = await (client as any).search({
        query: keyword,
        limit: 5,
        // Returns: [{ url, title, snippet }]
      });
    } else {
      // Fallback for SDK versions without search
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`);
      const html = await response.text();
      const dom = new JSDOM(html);
      results = Array.from(dom.window.document.querySelectorAll('.result')).slice(0, 5).map((el: any) => {
        const a = el.querySelector('.result__url');
        const title = el.querySelector('.result__title');
        return {
          url: "https://" + (a?.textContent?.trim() || "").replace('...', ''),
          title: title?.textContent?.trim() || keyword,
        };
      }).filter((r) => r.url !== "https://");
    }

    return NextResponse.json({ sources: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
