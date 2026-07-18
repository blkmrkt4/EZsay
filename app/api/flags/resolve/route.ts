import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { flags, flagOptions, sections, libraryEntries, documents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logStyleSignal } from "@/lib/style/logger";
import { validateReplacementBlocking } from "@/lib/analysis/corruption-checker";
import { requireSubscription } from "@/lib/stripe/require-subscription";
import { trackEvent } from "@/lib/events/track";

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

    // ── Single query: JOIN all tables we need (eliminates N+1 reads) ──
    const [flagRow] = await db
      .select({
        flag: flags,
        sectionId: sections.id,
        sectionCurrentText: sections.currentText,
        sectionFlagsResolved: sections.flagsResolved,
        documentId: documents.id,
        documentUserId: documents.userId,
        documentType: documents.documentType,
        optionText: flagOptions.text,
        libraryFlagCount: libraryEntries.flagCount,
        libraryAcceptanceRate: libraryEntries.acceptanceRate,
      })
      .from(flags)
      .innerJoin(sections, eq(sections.id, flags.sectionId))
      .innerJoin(documents, eq(documents.id, sections.documentId))
      .leftJoin(
        flagOptions,
        optionId ? eq(flagOptions.id, optionId) : sql`false`
      )
      .leftJoin(libraryEntries, eq(libraryEntries.id, flags.libraryEntryId))
      .where(eq(flags.id, flagId))
      .limit(1);

    if (!flagRow) {
      return NextResponse.json({ success: false, error: "Flag not found" }, { status: 404 });
    }
    if (flagRow.documentUserId !== user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // ── Compute the text change FIRST — refuse before any status write ──
    //
    // Replacement semantics (this caused real document corruption when it
    // was a blind offset splice — see PRD "Corruption root cause 2026-07-17"):
    //
    // - ai_artifact flags: the option/manual text is a NARROW replacement for
    //   the artifact instance ("(remove)" sentinel = delete). Replace the
    //   flagged span, verified against the CURRENT text and re-anchored by
    //   search if earlier edits moved it. Refuse if the text is gone.
    //
    // - every other flag: generated options are FULL-SECTION rewrites (the
    //   suggest prompts interpolate [SECTION_TEXT] only), and both editors
    //   prefill manual edits with the full section text — so the replacement
    //   IS the new section text. Never splice it into a narrow span: that
    //   pastes a whole paragraph mid-word and duplicates everything around it.
    // Idempotency guard: a flag that is already resolved (accepted, rejected,
    // skipped — including siblings AUTO-skipped by a whole-section accept)
    // must never be processed again. Without this, re-accepting an
    // auto-skipped sibling would overwrite the fresh rewrite with a stale
    // full-section option — the corruption class this route was rewritten
    // to kill.
    if (flagRow.flag.status !== "open" && flagRow.flag.status !== "generation_failed") {
      return NextResponse.json(
        { success: false, error: "This flag was already resolved (the section may have been rewritten since).", code: "already_resolved" },
        { status: 409 },
      );
    }

    const replacementRaw = action === "accepted"
      ? (optionId ? flagRow.optionText : manualText) ?? null
      : null;
    let newSectionText: string | null = null;
    let autoSkippedSiblings = 0;

    if (action === "accepted" && optionId && !flagRow.optionText) {
      return NextResponse.json({ success: false, error: "Option not found" }, { status: 404 });
    }
    if (action === "accepted" && replacementRaw === null) {
      // A bare accept would mark the flag resolved without changing any text.
      return NextResponse.json(
        { success: false, error: "Nothing to apply — select an option or provide an edit first." },
        { status: 400 },
      );
    }

    if (replacementRaw !== null) {
      let candidate: string;
      if (flagRow.flag.patternType === "ai_artifact") {
        const replacement = replacementRaw === "(remove)" ? "" : replacementRaw;
        const span = locateSpan(
          flagRow.sectionCurrentText,
          flagRow.flag.flaggedPhrase,
          flagRow.flag.phraseStart,
          flagRow.flag.phraseEnd,
        );
        if (!span) {
          return NextResponse.json(
            { success: false, error: "This text has changed since the scan — the suggestion no longer applies.", code: "stale_flag" },
            { status: 409 },
          );
        }
        candidate =
          flagRow.sectionCurrentText.slice(0, span.start) +
          replacement +
          flagRow.sectionCurrentText.slice(span.end);
      } else {
        // Whole-section replacement. Guard against a pathologically small
        // OPTION wiping a large section (truncated LLM output). Manual edits
        // are exempt — a user may deliberately condense a section hard.
        if (optionId && replacementRaw.trim().length < 40 && flagRow.sectionCurrentText.trim().length > 300) {
          return NextResponse.json(
            { success: false, error: "The replacement looks truncated and was not applied.", code: "suspect_replacement" },
            { status: 422 },
          );
        }
        candidate = replacementRaw;
      }

      // BLOCKING corruption check — conservative patterns only (line-anchored
      // LLM markers, code fences, markdown bold): a match here REFUSES the
      // accept, so prose-plausible phrases like "the verdict: guilty" must
      // not trigger it.
      const corruption = validateReplacementBlocking(flagRow.sectionCurrentText, candidate);
      if (corruption) {
        return NextResponse.json(
          { success: false, error: `The replacement looked corrupted and was not applied (${corruption}).`, code: "corrupt_replacement" },
          { status: 422 },
        );
      }
      newSectionText = candidate;
    }

    // ── Apply the text change with an optimistic concurrency guard ────
    // The write only lands if the section still contains exactly the text we
    // read and validated against. A concurrent writer (double-fire, second
    // tab, overlapping bulk fix) makes this a no-op instead of a silent
    // clobber — and the flag stays untouched because we haven't updated it.
    if (newSectionText !== null) {
      const written = await db
        .update(sections)
        .set({
          currentText: newSectionText,
          flagsResolved: flagRow.sectionFlagsResolved + 1,
        })
        .where(and(
          eq(sections.id, flagRow.sectionId),
          eq(sections.currentText, flagRow.sectionCurrentText),
        ))
        .returning({ id: sections.id });

      if (written.length === 0) {
        return NextResponse.json(
          { success: false, error: "The document changed while this edit was being applied — nothing was modified. Please retry.", code: "stale_section" },
          { status: 409 },
        );
      }
    }

    // ── Update flag status (only after the text change landed) ────────
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

    // A full-section rewrite invalidates every other open content flag in
    // the section — their text basis no longer exists. Auto-skip them so
    // they can't be accepted against the old text (artifact flags stay:
    // they re-anchor by search at their own accept time; a status guard
    // above refuses any attempt to re-resolve the skipped siblings).
    if (newSectionText !== null && updatedFlag.patternType !== "ai_artifact") {
      const skipped = await db
        .update(flags)
        .set({ status: "skipped" })
        .where(and(
          eq(flags.sectionId, flagRow.sectionId),
          sql`${flags.id} != ${flagId}`,
          sql`${flags.status} in ('open', 'generation_failed')`,
          sql`${flags.patternType} != 'ai_artifact'`,
        ))
        .returning({ id: flags.id });
      autoSkippedSiblings = skipped.length;
      if (autoSkippedSiblings > 0) {
        await db
          .update(sections)
          .set({ flagsResolved: sql`${sections.flagsResolved} + ${autoSkippedSiblings}` })
          .where(eq(sections.id, flagRow.sectionId));
      }
    }

    // ── Increment resolved count for skip/reject (atomic) ─────────────
    if (action === "skipped" || action === "rejected") {
      await db
        .update(sections)
        .set({ flagsResolved: sql`${sections.flagsResolved} + 1` })
        .where(eq(sections.id, flagRow.sectionId));
    }

    // ── Update library entry stats (uses data from initial JOIN) ─────
    if (updatedFlag.libraryEntryId && flagRow.libraryFlagCount != null) {
      const newFlagCount = flagRow.libraryFlagCount + 1;
      const accepted = action === "accepted" ? 1 : 0;
      const currentAccepted = (flagRow.libraryAcceptanceRate ?? 0) * flagRow.libraryFlagCount;
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

    // ── Event tracking ────────────────────────────────────────────────
    const eventName = action === "accepted" ? "flag_accepted" as const
      : action === "rejected" ? "flag_rejected" as const
      : "flag_skipped" as const;
    trackEvent(eventName, user.id, { flagId, patternType: updatedFlag.patternType });

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

    return NextResponse.json({ success: true, data: { ...updatedFlag, autoSkippedSiblings } });
  } catch (err) {
    console.error("Flag resolve error:", err);
    return NextResponse.json({ success: false, error: "Failed to resolve flag." }, { status: 500 });
  }
}

/**
 * Locate the span to replace in the CURRENT text: stored offsets when they
 * still match the flagged phrase, else the occurrence nearest the original
 * position (earlier edits shift text), else null — never splice blind.
 */
function locateSpan(
  text: string,
  phrase: string,
  storedStart: number,
  storedEnd: number,
): { start: number; end: number } | null {
  if (
    storedStart >= 0 &&
    storedEnd <= text.length &&
    text.slice(storedStart, storedEnd) === phrase
  ) {
    return { start: storedStart, end: storedEnd };
  }
  let best = -1;
  let bestDist = Infinity;
  let idx = text.indexOf(phrase);
  while (idx !== -1) {
    const dist = Math.abs(idx - storedStart);
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
    idx = text.indexOf(phrase, idx + 1);
  }
  return best === -1 ? null : { start: best, end: best + phrase.length };
}
