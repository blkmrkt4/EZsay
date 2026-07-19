/**
 * @deprecated Legacy config path. No live route calls loadConfig() — the
 * production LLM configuration is the Activity Binds system
 * (lib/routing/openrouter.ts: loadBind / executeActivity, backed by
 * activity_binds + model_library). Kept only until the legacy
 * prompt_configs/model_configs tables are dropped.
 */

import { db } from "@/db";
import { promptConfigs, promptVersions, modelConfigs, contextVersions } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface LLMConfig {
  activityType: string;
  promptText: string;
  contextText: string;
  primaryModel: string;
  fallbackModel1: string;
  fallbackModel2: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Loads the active prompt, context, and model config for a given activity type.
 * All LLM configuration reads from the database at runtime — nothing hardcoded.
 */
export async function loadConfig(activityType: string): Promise<LLMConfig> {
  // Load prompt config for this activity
  const [config] = await db
    .select()
    .from(promptConfigs)
    .where(eq(promptConfigs.activityType, activityType))
    .limit(1);

  if (!config) {
    throw new Error(`No prompt config found for activity type: ${activityType}`);
  }

  // Load active prompt version
  let promptText = "";
  if (config.activeVersionId) {
    const [version] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, config.activeVersionId))
      .limit(1);
    if (version) {
      promptText = version.promptText;
    }
  }

  // Load active context (ContextLLM — always prepended)
  const [activeContext] = await db
    .select()
    .from(contextVersions)
    .where(eq(contextVersions.isActive, true))
    .limit(1);

  const contextText = activeContext?.contextText ?? "";

  // Load model config
  let model = {
    primaryModel: "anthropic/claude-sonnet-4.6",
    fallbackModel1: "google/gemini-3-flash-preview",
    fallbackModel2: "openai/gpt-5.4-mini",
    temperature: 0.7,
    maxTokens: 2048,
  };

  if (config.modelConfigId) {
    const [mc] = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, config.modelConfigId))
      .limit(1);
    if (mc) {
      model = {
        primaryModel: mc.primaryModel,
        fallbackModel1: mc.fallbackModel1,
        fallbackModel2: mc.fallbackModel2,
        temperature: mc.temperature,
        maxTokens: mc.maxTokens,
      };
    }
  }

  return {
    activityType,
    promptText,
    contextText,
    ...model,
  };
}
