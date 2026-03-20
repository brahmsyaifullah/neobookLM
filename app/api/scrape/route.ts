import { NextRequest, NextResponse } from "next/server";
import Hyperbrowser from "@hyperbrowser/sdk";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

const client = new Hyperbrowser({ apiKey: process.env.HYPERBROWSER_API_KEY! });

// Domains where plain fetch is sufficient (saves credits)
const STATIC_DOMAINS = [
  "wikipedia.org", "github.com", "developer.mozilla.org",
  "docs.cloudflare.com", "nextjs.org", "supabase.com",
  "arxiv.org", "dev.to", "medium.com",
];

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const isStatic = STATIC_DOMAINS.some((d) => url.includes(d));

  // Fast path: plain fetch + Readability (free, no credits)
  if (isStatic) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)" },
      });
      const html = await res.text();
      const dom = new JSDOM(html, { url });
      const article = new Readability(dom.window.document).parse();
      const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
      const markdown = td.turndown(article?.content ?? html);
      return NextResponse.json({ markdown, title: article?.title ?? url, url });
    } catch {
      // Fall through to Hyperbrowser if plain fetch fails
    }
  }

  // Hyperbrowser path (JS-heavy pages, dynamic content)
  try {
    const result = await client.scrape.startAndWait({ url, scrapeOptions: { timeout: 15000 } });
    return NextResponse.json({
      markdown: result.data?.markdown ?? result.data?.html ?? "",
      title: result.data?.metadata?.title ?? url,
      url,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
