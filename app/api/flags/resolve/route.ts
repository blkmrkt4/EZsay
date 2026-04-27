import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, flagOptions, sections, libraryEntries, documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logStyleSignal } from "@/lib/style/logger";
import { validateReplacement } from "@/lib/analysis/corruption-checker";
import { requireSubscription } from "@/lib/stripe/require-subscription";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const gateResponse = await requireSubscription(user.id);
  if (gateResponse) return gateResponse;

  try {
    const { flagId, action, optionId, manualText } = await request.json();

    // ── Single JOIN query for ownership check + all data we need ──────
    const [flagRow] = await db
      .select({
        flag: flags,
        sectionId: sections.id,
        sectionCurrentText: sections.currentText,
        sectionFlagsResolved: sections.flagsResolved,
        documentId: documents.id,
        documentUserId: documents.userId,
        documentType: documents.documentType,
      })
      .from(flags)
      .innerJoin(sections, eq(sections.id, flags.sectionId))
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .where(eq(flags.id, flagId))
      .limit(1);

    if (!flagRow) {
      return NextResponse.json({ success: false, error: "Flag not found" }, { status: 404 });
    }
    if (flagRow.documentUserId !== user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // ── Update flag status ───────────────────────────────────────────
    const updateData: Record<string, unknown> = { status: action };

    if (optionId) {
      updateData.acceptedOptionId = optionId;
      await db
        .update(flagOptions)
        .set({ accepted: true })
        .where(eq(flagOptions.id, optionId));
    }

    if (manualText) {
      updateData.manualReplacement = manualText;
    }

    const [updatedFlag] = await db
      .update(flags)
      .set(updateData)
      .where(eq(flags.id, flagId))
      .returning();

    if (!updatedFlag) {
      return NextResponse.json({ success: false, error: "Flag not found" }, { status: 404 });
    }

    // ── Update section text if accepted with an option ────────────────
    if (action === "accepted" && optionId) {
      const [option] = await db
        .select()
        .from(flagOptions)
        .where(eq(flagOptions.id, optionId))
        .limit(1);

      if (option) {
        const newText =
          flagRow.sectionCurrentText.slice(0, updatedFlag.phraseStart) +
          option.text +
          flagRow.sectionCurrentText.slice(updatedFlag.phraseEnd);

        const corruption = validateReplacement(flagRow.sectionCurrentText, newText);
        if (corruption) {
          console.warn(`[flags/resolve] Corruption detected in replacement: ${corruption}`);
        }

        await db
          .update(sections)
          .set({
            currentText: newText,
            flagsResolved: flagRow.sectionFlagsResolved + 1,
          })
          .where(eq(sections.id, flagRow.sectionId));
      }
    }

    // ── Increment resolved count for skip/reject ─────────────────────
    if (action === "skipped" || action === "rejected") {
      await db
        .update(sections)
        .set({ flagsResolved: flagRow.sectionFlagsResolved + 1 })
        .where(eq(sections.id, flagRow.sectionId));
    }

    // ── Update library entry stats (async) ───────────────────────────
    if (updatedFlag.libraryEntryId) {
      const [entry] = await db
        .select()
        .from(libraryEntries)
        .where(eq(libraryEntries.id, updatedFlag.libraryEntryId))
        .limit(1);

      if (entry) {
        const newFlagCount = entry.flagCount + 1;
        const accepted = action === "accepted" ? 1 : 0;
        const currentAccepted = (entry.acceptanceRate ?? 0) * entry.flagCount;
        const newRate = (currentAccepted + accepted) / newFlagCount;

        await db
          .update(libraryEntries)
          .set({
            flagCount: newFlagCount,
            acceptanceRate: newRate,
            updatedAt: new Date(),
          })
          .where(eq(libraryEntries.id, updatedFlag.libraryEntryId));
      }
    }

    // ── Fire-and-forget style profile logging ────────────────────────
    const signalWeight = manualText
      ? "manual_rewrite"
      : optionId
        ? "option_selected"
        : action === "rejected" || action === "skipped"
          ? "rejected"
          : "option_selected";

    logStyleSignal(user.id, flagRow.documentType, {
      patternType: updatedFlag.patternType,
      originalPhrase: updatedFlag.flaggedPhrase,
      replacement: manualText || "",
      signalWeight,
      documentType: flagRow.documentType,
    }).catch((err) => console.error("Style logging failed:", err));

    return NextResponse.json({ success: true, data: updatedFlag });
  } catch (err) {
    console.error("Flag resolve error:", err);
    return NextResponse.json({ success: false, error: "Failed to resolve flag." }, { status: 500 });
  }
}
