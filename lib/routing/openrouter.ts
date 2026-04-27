import { db } from "@/db";
import { adminSettings, activityBinds, modelLibrary, promptLibrary, contextLibrary, contextVersions, libraryEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Gets the OpenRouter API key from admin_settings table.
 * Falls back to OPENROUTER_API_KEY env var if not set in DB.
 */
async function getApiKey(): Promise<string> {
  const [setting] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, "openrouter_api_key"))
    .limit(1);

  if (setting?.value) return setting.value;

  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;

  throw new Error("No OpenRouter API key configured. Set it in Admin > Settings.");
}

/**
 * Loads a fully resolved Activity Bind — model details, prompt text, and context content.
 */
export async function loadBind(slug: string) {
  const [bind] = await db
    .select()
    .from(activityBinds)
    .where(eq(activityBinds.slug, slug))
    .limit(1);

  if (!bind) throw new Error(`No activity bind found for slug: ${slug}`);

  // Load model
  let model = { openrouterModelId: "anthropic/claude-sonnet-4-20250514", temperature: 0.7, maxTokens: 2048 };
  if (bind.modelId) {
    const [m] = await db.select().from(modelLibrary).where(eq(modelLibrary.id, bind.modelId)).limit(1);
    if (m) model = { openrouterModelId: m.openrouterModelId, temperature: m.temperature, maxTokens: m.maxTokens };
  }

  // Load fallback models
  const fallbacks: string[] = [];
  if (bind.fallbackModelId1) {
    const [fb] = await db.select().from(modelLibrary).where(eq(modelLibrary.id, bind.fallbackModelId1)).limit(1);
    if (fb) fallbacks.push(fb.openrouterModelId);
  }
  if (bind.fallbackModelId2) {
    const [fb] = await db.select().from(modelLibrary).where(eq(modelLibrary.id, bind.fallbackModelId2)).limit(1);
    if (fb) fallbacks.push(fb.openrouterModelId);
  }

  // Load prompt
  let systemPrompt = "";
  let userPrompt = "";
  if (bind.promptId) {
    const [p] = await db.select().from(promptLibrary).where(eq(promptLibrary.id, bind.promptId)).limit(1);
    if (p) {
      systemPrompt = p.systemPrompt;
      userPrompt = p.userPrompt;
    }
  }

  // Load context — build from all attached context resources
  let contextText = "";
  const contextIds = (bind.contextIds as string[]) || [];
  for (const cid of contextIds) {
    const [ctx] = await db.select().from(contextLibrary).where(eq(contextLibrary.id, cid)).limit(1);
    if (!ctx) continue;

    if (ctx.sourceType === "context_llm") {
      // Load active ContextLLM version
      const [active] = await db.select().from(contextVersions).where(eq(contextVersions.isActive, true)).limit(1);
      if (active) contextText += active.contextText + "\n\n";
    } else if (ctx.sourceType === "phrase_library") {
      // Load active library entries as a reference list
      const entries = await db.select().from(libraryEntries).where(eq(libraryEntries.status, "active"));
      const phraseList = entries
        .filter((e) => e.entryType === "exact_phrase")
        .map((e) => e.value)
        .join(", ");
      if (phraseList) contextText += `BANNED PHRASES: ${phraseList}\n\n`;
    } else if (ctx.content) {
      contextText += ctx.content + "\n\n";
    }
  }

  return {
    bind,
    model,
    fallbacks,
    systemPrompt,
    userPrompt,
    contextText,
  };
}

/**
 * Calls OpenRouter with the given messages and model config.
 * Tries primary model first, then fallbacks in order.
 * Each model is tried exactly once — no retry loops.
 */
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES_ON_429 = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  modelId: string,
  fallbacks: string[],
  temperature: number,
  maxTokens: number,
): Promise<{ content: string; modelUsed: string; inputTokens: number; outputTokens: number; latencyMs: number }> {
  const apiKey = await getApiKey();
  const modelsToTry = [modelId, ...fallbacks];
  const startTime = Date.now();

  const errors: string[] = [];

  for (const model of modelsToTry) {
    // Retry loop for 429 rate limits on each model
    for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
      try {
        console.log(`[OpenRouter] Trying model: ${model}${attempt > 0 ? ` (retry ${attempt})` : ""}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ezsay.app",
            "X-Title": "EzSay",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 30_000) : (attempt + 1) * 2000;
          const msg = `[OpenRouter] Rate limited (429) on ${model}, waiting ${waitMs}ms before retry`;
          console.warn(msg);
          if (attempt < MAX_RETRIES_ON_429) {
            await sleep(waitMs);
            continue; // Retry same model
          }
          errors.push(`[OpenRouter] Rate limited on ${model} after ${MAX_RETRIES_ON_429} retries`);
          break; // Move to next fallback
        }

        if (!response.ok) {
          const errorText = await response.text();
          const msg = `[OpenRouter] HTTP ${response.status} from ${model}: ${errorText}`;
          console.error(msg);
          errors.push(msg);
          break; // Non-429 errors go straight to next fallback
        }

        const data: OpenRouterResponse = await response.json();

        if (!data.choices?.[0]?.message?.content) {
          const msg = `[OpenRouter] Empty response from ${model}: ${JSON.stringify(data).slice(0, 500)}`;
          console.error(msg);
          errors.push(msg);
          break;
        }

        const latencyMs = Date.now() - startTime;
        console.log(`[OpenRouter] Success with ${model} (${data.usage?.prompt_tokens ?? "?"}in/${data.usage?.completion_tokens ?? "?"}out tokens, ${latencyMs}ms)`);
        return {
          content: data.choices[0].message.content,
          modelUsed: model,
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          latencyMs,
        };
      } catch (err) {
        const isTimeout = err instanceof DOMException && err.name === "AbortError";
        const msg = isTimeout
          ? `[OpenRouter] Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s for ${model}`
          : `[OpenRouter] Network error for ${model}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(msg);
        errors.push(msg);
        break; // Network errors / timeouts go to next fallback
      }
    }
  }

  throw new Error(`All models failed: ${errors.join(" | ")}`);
}

/**
 * High-level: execute an activity bind by slug.
 * Loads the bind config, builds messages, calls OpenRouter.
 */
export async function executeActivity(
  slug: string,
  tokenReplacements: Record<string, string>,
): Promise<{ content: string; modelUsed: string; inputTokens: number; outputTokens: number; latencyMs: number }> {
  const config = await loadBind(slug);

  // Build system message: context + system prompt
  let systemContent = "";
  if (config.contextText) systemContent += config.contextText;
  if (config.systemPrompt) systemContent += config.systemPrompt;

  // Build user message: interpolate tokens into user prompt
  let userContent = config.userPrompt;
  for (const [key, value] of Object.entries(tokenReplacements)) {
    userContent = userContent.replace(new RegExp(`\\[${key}\\]`, "g"), value);
  }

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];

  return callOpenRouter(
    messages,
    config.model.openrouterModelId,
    config.fallbacks,
    config.model.temperature,
    config.model.maxTokens,
  );
}
