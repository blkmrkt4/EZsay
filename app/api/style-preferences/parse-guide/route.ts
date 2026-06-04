import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { userStylePreferences } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { detectFileType, parseDocument } from "@/lib/parsers";
import { loadBind, callOpenRouter } from "@/lib/routing/openrouter";
import { PREFERENCE_DEFINITIONS } from "@/lib/style-settings/definitions";

const MAX_GUIDE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_GUIDE_TEXT = 50_000; // chars sent to LLM

/**
 * POST /api/style-preferences/parse-guide
 * Uploads a style guide file, extracts text, sends to LLM to parse into
 * structured preferences, and merges them into the user's style preferences.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const documentType = (formData.get("documentType") as string) || null;

  if (!file) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_GUIDE_SIZE) {
    return NextResponse.json({ success: false, error: "File too large (max 5 MB)" }, { status: 400 });
  }

  const fileType = detectFileType(file.name);
  if (!fileType) {
    return NextResponse.json(
      { success: false, error: "Unsupported file type. Upload a PDF, DOCX, or TXT file." },
      { status: 400 },
    );
  }

  try {
    // Extract text from the uploaded file
    const buffer = await file.arrayBuffer();
    const rawText = await parseDocument(buffer, fileType);

    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: "Could not extract enough text from the file. Try a different format." },
        { status: 400 },
      );
    }

    // Truncate if very long
    const guideText = rawText.slice(0, MAX_GUIDE_TEXT);

    // Build the preference key descriptions for the LLM
    const keyDescriptions = PREFERENCE_DEFINITIONS.map(
      (d) => {
        let desc = `"${d.key}": ${d.description}`;
        if (d.inputType === "boolean") desc += " (true or false)";
        if (d.inputType === "select" && d.options) {
          desc += ` (one of: ${d.options.map((o) => `"${o.value}"`).join(", ")})`;
        }
        if (d.inputType === "number") desc += " (number)";
        return desc;
      },
    ).join("\n");

    // Call LLM to extract preferences from the guide
    const config = await loadBind("suggest-rewrite");

    const systemContent = `You are a style guide parser. You read style guides and extract explicit formatting rules as structured JSON. Only extract rules that are explicitly stated in the guide — do not infer or assume rules that are not mentioned. Return a JSON object mapping preference keys to values. If a rule is ambiguous or not mentioned, omit it.`;

    const userContent = `Read this style guide and extract any formatting rules that match the preference keys below. Return ONLY a valid JSON object with the matched keys and values. No commentary, no markdown, no explanation.

VALID PREFERENCE KEYS:
${keyDescriptions}

STYLE GUIDE TEXT:
---
${guideText}
---

Return a JSON object like: {"british_spelling": true, "citation_format": "harvard", ...}
Only include keys where the guide explicitly states a rule.`;

    const result = await callOpenRouter(
      [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      config.model.openrouterModelId,
      config.fallbacks,
      0.1, // low temperature for structured extraction
      2048,
    );

    // Parse the LLM response as JSON
    let parsed: Record<string, unknown> = {};
    try {
      // Strip markdown code fences if present
      let cleaned = result.content.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to parse style guide. The guide may not contain recognisable formatting rules." },
        { status: 422 },
      );
    }

    // Validate: only keep keys that exist in PREFERENCE_DEFINITIONS
    const validKeys = new Set(PREFERENCE_DEFINITIONS.map((d) => d.key));
    const validPrefs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (validKeys.has(key) && value !== null && value !== undefined) {
        validPrefs[key] = value;
      }
    }

    if (Object.keys(validPrefs).length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          parsed: {},
          message: "No matching style rules were found in the guide.",
          fileName: file.name,
        },
      });
    }

    // Merge parsed preferences into the user's existing preferences
    const docTypeValue = documentType as "academic" | "professional" | "casual" | "legal" | null;
    const whereClause = docTypeValue
      ? and(eq(userStylePreferences.userId, user.id), eq(userStylePreferences.documentType, docTypeValue))
      : and(eq(userStylePreferences.userId, user.id), isNull(userStylePreferences.documentType));

    const [existing] = await db.select().from(userStylePreferences).where(whereClause).limit(1);

    if (existing) {
      const merged = { ...((existing.preferences as Record<string, unknown>) ?? {}), ...validPrefs };
      await db.update(userStylePreferences).set({
        preferences: merged,
        styleGuideFileUrl: file.name,
        styleGuideParsedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(userStylePreferences.id, existing.id));
    } else {
      await db.insert(userStylePreferences).values({
        userId: user.id,
        documentType: docTypeValue,
        preferences: validPrefs,
        styleGuideFileUrl: file.name,
        styleGuideParsedAt: new Date(),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        parsed: validPrefs,
        count: Object.keys(validPrefs).length,
        fileName: file.name,
      },
    });
  } catch (err) {
    console.error("Style guide parsing failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to process the style guide. Please try again." },
      { status: 500 },
    );
  }
}
