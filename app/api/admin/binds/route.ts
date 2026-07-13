import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityBinds, modelLibrary, promptLibrary, contextLibrary } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";

// System slugs — auto-populated, can't be deleted
const SYSTEM_SLUGS = [
  { slug: "surface-scan", name: "Surface Scan", description: "Quick pass — exact phrase matching for banned words and obvious AI phrases" },
  { slug: "deep-scan", name: "Deep Scan", description: "Second pass — adds structural regex patterns and sentence-level analysis" },
  { slug: "comprehensive-scan", name: "Comprehensive Scan", description: "Full analysis — semantic patterns, density, burstiness, voice checks" },
  { slug: "suggest-rewrite", name: "Suggest Rewrite", description: "Generate replacement options for flagged content" },
  { slug: "suggest-academic", name: "Suggest Academic Rewrite", description: "Generate options tailored for academic documents" },
  { slug: "suggest-tone", name: "Suggest Tone Edit", description: "Generate tone and voice adjustments" },
  { slug: "evaluate-rewrite", name: "Evaluate Manual Rewrite", description: "Evaluate a user's manual rewrite for quality and patterns" },
  { slug: "citation-verify", name: "Citation Verification", description: "Verify citation accuracy via web search" },
  { slug: "citation-verify-queries", name: "Citation Search Queries", description: "Generate web search queries for citation verification" },
  { slug: "citation-convert", name: "Citation Style Conversion", description: "Convert citations between academic styles" },
  { slug: "citation-quote-check", name: "Citation Quote Check", description: "Verify quotations against fetched source text" },
  { slug: "expand-prose", name: "Expand Prose", description: "Expand outline sections into full prose" },
];

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    // Ensure system slugs exist
    for (const sys of SYSTEM_SLUGS) {
      const [existing] = await db
        .select()
        .from(activityBinds)
        .where(eq(activityBinds.slug, sys.slug))
        .limit(1);

      if (!existing) {
        await db.insert(activityBinds).values({
          ...sys,
          isSystem: true,
        });
      }
    }

    const binds = await db
      .select()
      .from(activityBinds)
      .orderBy(desc(activityBinds.isSystem), activityBinds.name);

    // Also load library items for dropdown options
    const models = await db.select().from(modelLibrary).orderBy(modelLibrary.name);
    const prompts = await db.select().from(promptLibrary).orderBy(promptLibrary.name);
    const contexts = await db.select().from(contextLibrary).orderBy(contextLibrary.name);

    return NextResponse.json({ success: true, data: { binds, models, prompts, contexts } });
  } catch (err) {
    console.error("Admin binds GET error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { name, slug, description } = body;
      const [bind] = await db
        .insert(activityBinds)
        .values({ name, slug, description, isSystem: false })
        .returning();
      return NextResponse.json({ success: true, data: bind });
    }

    if (action === "update") {
      const { id, ...updates } = body;
      delete updates.action;
      updates.updatedAt = new Date();

      const [bind] = await db
        .update(activityBinds)
        .set(updates)
        .where(eq(activityBinds.id, id))
        .returning();

      return NextResponse.json({ success: true, data: bind });
    }

    if (action === "delete") {
      const { id } = body;
      // Prevent deleting system binds
      const [bind] = await db.select().from(activityBinds).where(eq(activityBinds.id, id)).limit(1);
      if (bind?.isSystem) {
        return NextResponse.json({ success: false, error: "Cannot delete system activity" }, { status: 400 });
      }
      await db.delete(activityBinds).where(eq(activityBinds.id, id));
      return NextResponse.json({ success: true });
    }

    // ── Library CRUD ─────────────────────────────────────────────────────

    if (action === "add_model") {
      const { openrouterModelId, name, description } = body;
      const [item] = await db.insert(modelLibrary).values({ openrouterModelId, name, description }).returning();
      return NextResponse.json({ success: true, data: item });
    }

    if (action === "delete_model") {
      await db.delete(modelLibrary).where(eq(modelLibrary.id, body.id));
      return NextResponse.json({ success: true });
    }

    if (action === "add_prompt") {
      const { name, description, systemPrompt, userPrompt } = body;
      const [item] = await db.insert(promptLibrary).values({ name, description, systemPrompt, userPrompt }).returning();
      return NextResponse.json({ success: true, data: item });
    }

    if (action === "update_prompt") {
      const { id, name, description, systemPrompt, userPrompt } = body;
      const [item] = await db.update(promptLibrary).set({ name, description, systemPrompt, userPrompt, updatedAt: new Date() }).where(eq(promptLibrary.id, id)).returning();
      return NextResponse.json({ success: true, data: item });
    }

    if (action === "delete_prompt") {
      await db.delete(promptLibrary).where(eq(promptLibrary.id, body.id));
      return NextResponse.json({ success: true });
    }

    if (action === "add_context") {
      const { name, description, sourceType, content } = body;
      const [item] = await db.insert(contextLibrary).values({ name, description, sourceType, content }).returning();
      return NextResponse.json({ success: true, data: item });
    }

    if (action === "delete_context") {
      await db.delete(contextLibrary).where(eq(contextLibrary.id, body.id));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Admin binds POST error:", err);
    return NextResponse.json({ success: false, error: "Operation failed." }, { status: 500 });
  }
}
