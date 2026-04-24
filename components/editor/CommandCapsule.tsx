"use client";

import type { ReactNode } from "react";
import AuditorScoreRing from "./AuditorScoreRing";

interface CommandCapsuleProps {
  /** The Scan button (and any wrapping state / tooltip) passed verbatim. */
  scanSlot: ReactNode;
  /** Current Auditor Score (0-100) or null while no score is available. */
  score: number | null;
}

/**
 * Floating glassmorphism pill fixed at the top-center of the viewport.
 * Houses the primary command (Scan) and the Auditor Score ring.
 *
 * - `fixed top-6 left-1/2 -translate-x-1/2` centers horizontally at 24px from top
 * - `z-[60]` sits above all workspace panels (which don't use a z-index)
 * - semi-transparent white bg + backdrop blur lets document content bleed behind
 * - high-elevation diffuse shadow + inner highlight ring for glass feel
 */
export default function CommandCapsule({ scanSlot, score }: CommandCapsuleProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-6 z-[60] flex justify-center px-4"
      aria-label="Workspace command bar"
    >
      <div
        className={[
          "pointer-events-auto flex max-w-full items-center rounded-full py-2",
          // Breathing room bump — +8px each end vs previous
          "gap-5 pl-7 pr-8 sm:gap-6 sm:pl-8 sm:pr-9",
          // Glassmorphism — light vs dark material + rim-light border + blur strength
          "bg-[rgba(255,255,255,0.7)] dark:bg-[rgba(15,23,42,0.8)]",
          "border border-[rgba(255,255,255,0.5)] dark:border-[rgba(255,255,255,0.1)]",
          "backdrop-blur-[14px] dark:backdrop-blur-[20px]",
        ].join(" ")}
        style={{
          // Safari fallback — backdrop-filter prefixed + dual-layer shadow
          WebkitBackdropFilter: "blur(14px)",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 20px 40px -5px rgba(0, 0, 0, 0.10)",
        }}
      >
        <div className="flex items-center self-center">{scanSlot}</div>
        <div className="h-6 w-px shrink-0 self-center bg-gray-300/50 dark:bg-white/10" aria-hidden />
        <div className="flex items-center gap-3 self-center">
          <span className="hidden text-[6px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500 sm:inline">
            Auditor
          </span>
          <AuditorScoreRing score={score} />
        </div>
      </div>
    </div>
  );
}
