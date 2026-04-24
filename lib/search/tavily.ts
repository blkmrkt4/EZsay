import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
}

async function getTavilyKey(): Promise<string | null> {
  const [setting] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, "tavily_api_key"))
    .limit(1);

  if (setting?.value) return setting.value;
  if (process.env.TAVILY_API_KEY) return process.env.TAVILY_API_KEY;

  return null;
}

/**
 * Search the web via Tavily (paid, better results).
 */
async function tavilySearch(
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_raw_content: false,
      include_answer: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavily API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();

  return (data.results ?? []).map((r: { url: string; title: string; content: string; score: number }) => ({
    url: r.url,
    title: r.title,
    content: r.content,
    score: r.score,
  }));
}

/**
 * Search the web via DuckDuckGo HTML (free, no API key needed).
 * Scrapes the lite HTML version for results.
 */
async function duckDuckGoSearch(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EzSay/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo error ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Parse result links from DDG lite HTML
  // Each result has class="result__a" for the link and class="result__snippet" for the snippet
  const linkPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
  const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/g;

  const links: { url: string; title: string }[] = [];
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    // DDG wraps URLs in a redirect — extract the actual URL
    let url = match[1];
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    links.push({ url, title: match[2].replace(/<[^>]*>/g, "").trim() });
  }

  const snippets: string[] = [];
  while ((match = snippetPattern.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      url: links[i].url,
      title: links[i].title,
      content: snippets[i] ?? "",
      score: 0.7 - (i * 0.05), // Approximate relevance by position
    });
  }

  return results;
}

/**
 * Search the web for content matching a query.
 * Uses Tavily if an API key is configured, otherwise falls back to DuckDuckGo (free, no key needed).
 */
export async function webSearch(
  query: string,
  maxResults: number = 5,
): Promise<SearchResult[]> {
  const tavilyKey = await getTavilyKey();

  if (tavilyKey) {
    console.log(`[search] Using Tavily for: "${query.slice(0, 50)}..."`);
    return tavilySearch(query, tavilyKey, maxResults);
  }

  console.log(`[search] No Tavily key — using DuckDuckGo (free) for: "${query.slice(0, 50)}..."`);
  return duckDuckGoSearch(query, maxResults);
}
