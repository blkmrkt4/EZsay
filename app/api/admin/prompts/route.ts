import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { promptConfigs, promptVersions, contextVersions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Forbidden", status: 403 };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  // Load all prompt configs with their active version and all versions
  const configs = await db
    .select()
    .from(promptConfigs)
    .orderBy(promptConfigs.activityType);

  const versions = await db
    .select()
    .from(promptVersions)
    .orderBy(desc(promptVersions.createdAt));

  const context = await db
    .select()
    .from(contextVersions)
    .orderBy(desc(contextVersions.createdAt));

  return NextResponse.json({
    success: true,
    data: { configs, versions, context },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "save_version") {
      const { activityType, name, promptText } = body;

      const [version] = await db
        .insert(promptVersions)
        .values({
          activityType,
          name,
          promptText,
          createdBy: auth.user.id,
        })
        .returning();

      // Set as active
      await db
        .update(promptConfigs)
        .set({ activeVersionId: version.id, updatedBy: auth.user.id, updatedAt: new Date() })
        .where(eq(promptConfigs.activityType, activityType));

      return NextResponse.json({ success: true, data: version });
    }

    if (action === "set_active") {
      const { activityType, versionId } = body;

      await db
        .update(promptConfigs)
        .set({ activeVersionId: versionId, updatedBy: auth.user.id, updatedAt: new Date() })
        .where(eq(promptConfigs.activityType, activityType));

      return NextResponse.json({ success: true });
    }

    if (action === "save_context") {
      const { name, contextText } = body;

      // Deactivate all existing
      await db
        .update(contextVersions)
        .set({ isActive: false });

      const [version] = await db
        .insert(contextVersions)
        .values({
          name,
          contextText,
          isActive: true,
          createdBy: auth.user.id,
        })
        .returning();

      return NextResponse.json({ success: true, data: version });
    }

    if (action === "restore_context") {
      const { versionId } = body;

      await db.update(contextVersions).set({ isActive: false });
      await db
        .update(contextVersions)
        .set({ isActive: true })
        .where(eq(contextVersions.id, versionId));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Admin prompts POST error:", err);
    return NextResponse.json({ success: false, error: "Operation failed." }, { status: 500 });
  }
}
