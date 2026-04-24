import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, flagOptions, sections, libraryEntries, documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logStyleSignal } from "@/lib/style/logger";
import { validateReplacement } from "@/lib/analysis/corruption-checker";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { flagId, action, optionId, manualText } = await request.json();

  // Update flag status
  const updateData: Record<string, unknown> = {
    status: action,
  };

  if (optionId) {
    updateData.acceptedOptionId = optionId;

    // Mark the option as accepted
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
    return NextResponse.json(
      { success: false, error: "Flag not found" },
      { status: 404 }
    );
  }

  // If accepted with an option, update the section's currentText
  if (action === "accepted" && optionId) {
    const [option] = await db
      .select()
      .from(flagOptions)
      .where(eq(flagOptions.id, optionId))
      .limit(1);

    if (option) {
      const [section] = await db
        .select()
        .from(sections)
        .where(eq(sections.id, updatedFlag.sectionId))
        .limit(1);

      if (section) {
        // Replace the flagged phrase with the option text
        const newText =
          section.currentText.slice(0, updatedFlag.phraseStart) +
          option.text +
          section.currentText.slice(updatedFlag.phraseEnd);

        // Validate that the replacement doesn't introduce corruption
        const corruption = validateReplacement(section.currentText, newText);
        if (corruption) {
          console.warn(`[flags/resolve] Corruption detected in replacement: ${corruption}`);
          // Still apply — but log the warning so it can be investigated
        }

        await db
          .update(sections)
          .set({
            currentText: newText,
            flagsResolved: section.flagsResolved + 1,
          })
          .where(eq(sections.id, section.id));
      }
    }
  }

  // Update resolved count if skipped or rejected
  if (action === "skipped" || action === "rejected") {
    const [section] = await db
      .select()
      .from(sections)
      .where(eq(sections.id, updatedFlag.sectionId))
      .limit(1);

    if (section) {
      await db
        .update(sections)
        .set({ flagsResolved: section.flagsResolved + 1 })
        .where(eq(sections.id, section.id));
    }
  }

  // Update library entry flag count and acceptance rate (async)
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

  // Fire-and-forget style profile logging (hard constraint #5: manual_rewrite = weight 3)
  const [section] = await db
    .select()
    .from(sections)
    .where(eq(sections.id, updatedFlag.sectionId))
    .limit(1);

  if (section) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, section.documentId))
      .limit(1);

    if (doc) {
      const signalWeight = manualText
        ? "manual_rewrite"
        : optionId
          ? "option_selected"
          : action === "rejected" || action === "skipped"
            ? "rejected"
            : "option_selected";

      logStyleSignal(user.id, doc.documentType, {
        patternType: updatedFlag.patternType,
        originalPhrase: updatedFlag.flaggedPhrase,
        replacement: manualText || "",
        signalWeight,
        documentType: doc.documentType,
      }).catch((err) => console.error("Style logging failed:", err));
    }
  }

  return NextResponse.json({ success: true, data: updatedFlag });
}
