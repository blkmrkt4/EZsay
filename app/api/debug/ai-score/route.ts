import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { documents, sections, adminSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const MODELS = [
  { id: "mistralai/mistral-large-2512", label: "Mistral Large" },
  { id: "qwen/qwen3.6-plus", label: "Qwen 3.6 Plus" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "x-ai/grok-4", label: "Grok 4" },
  { id: "cohere/command-a", label: "Cohere Command A" },
];

const SYSTEM_PROMPT = `You are an AI-generated text detector. Analyse the following document and estimate how likely it is to have been written or substantially assisted by an AI language model.

Score from 0 to 100:
  0  = certainly AI-generated (very detectable)
  100 = certainly human-written (undetectable)

Consider these signals:
- Vocabulary uniformity and word choice patterns
- Sentence length variation (or lack of it)
- Paragraph structure consistency
- Use of hedging phrases, filler transitions, and corporate fluff
- Presence or absence of personal voice, tangents, self-corrections
- Information density — does every sentence carry equal weight?
- Contraction usage rate
- Cliché openers and formulaic structures

Respond in EXACTLY this format:
SCORE: [number 0-100]
CONFIDENCE: [low/medium/high]
REASONING: [2-3 sentences explaining the key signals you detected]`;

async function getApiKey(): Promise<string> {
  const [setting] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, "openrouter_api_key"))
    .limit(1);
  if (setting?.value) return setting.value;
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  throw new Error("No OpenRouter API key configured");
}

function parseScore(response: string): { score: number; confidence: string; reasoning: string } {
  const scoreMatch = response.match(/SCORE:\s*(\d+)/i);
  const confMatch = response.match(/CONFIDENCE:\s*(low|medium|high)/i);
  const reasonMatch = response.match(/REASONING:\s*([\s\S]*?)$/i);

  return {
    score: scoreMatch ? parseInt(scoreMatch[1], 10) : -1,
    confidence: confMatch ? confMatch[1] : "unknown",
    reasoning: reasonMatch ? reasonMatch[1].trim() : response.trim(),
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await request.json();

  // Load document text
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  const docSections = await db
    .select()
    .from(sections)
    .where(eq(sections.documentId, documentId))
    .orderBy(sections.index);

  const fullText = docSections
    .filter((s) => !s.isLocked)
    .map((s) => s.currentText)
    .join("\n\n");

  if (!fullText.trim()) {
    return NextResponse.json({ success: false, error: "Document has no text" }, { status: 400 });
  }

  const apiKey = await getApiKey();
  const results: { model: string; label: string; score: number; confidence: string; reasoning: string; error?: string; latencyMs: number }[] = [];

  // Call all 5 models in parallel
  const promises = MODELS.map(async (model) => {
    const startTime = Date.now();
    try {
      console.log(`[debug/ai-score] Calling ${model.label} (${model.id})`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ezsay.app",
          "X-Title": "EzSay",
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Analyse this document for AI-generated content:\n\n---\n${fullText}\n---` },
          ],
          temperature: 0.3,
          max_tokens: 512,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[debug/ai-score] ${model.label} HTTP ${response.status}: ${errorText}`);
        return {
          model: model.id,
          label: model.label,
          score: -1,
          confidence: "n/a",
          reasoning: "",
          error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
          latencyMs,
        };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";

      if (!content) {
        // Log full response to help debug — some models use different response shapes
        console.error(`[debug/ai-score] ${model.label} empty content. Full response: ${JSON.stringify(data).slice(0, 500)}`);
        return {
          model: model.id,
          label: model.label,
          score: -1,
          confidence: "n/a",
          reasoning: "",
          error: `Empty response: ${JSON.stringify(data).slice(0, 150)}`,
          latencyMs,
        };
      }

      const parsed = parseScore(content);
      console.log(`[debug/ai-score] ${model.label}: score=${parsed.score}, confidence=${parsed.confidence} (${latencyMs}ms)`);

      return {
        model: model.id,
        label: model.label,
        ...parsed,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[debug/ai-score] ${model.label} error: ${errorMsg}`);
      return {
        model: model.id,
        label: model.label,
        score: -1,
        confidence: "n/a",
        reasoning: "",
        error: errorMsg,
        latencyMs,
      };
    }
  });

  const settled = await Promise.all(promises);
  results.push(...settled);

  // Sort by score descending (highest AI detection first)
  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    success: true,
    data: { results },
  });
}
