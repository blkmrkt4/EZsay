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
 * Glassmorphism pill housing the Scan command and Auditor Score ring.
 * Renders inline (not fixed/floating) — designed to sit in the top header bar.
 */
export default function CommandCapsule({ scanSlot, score }: CommandCapsuleProps) {
  return (
    <div
      className={[
        "flex shrink-0 items-center rounded-full py-1.5",
        "gap-4 pl-5 pr-6",
        // Glassmorphism — light vs dark material + rim-light border + blur strength
        "bg-[rgba(255,255,255,0.7)] dark:bg-[rgba(15,23,42,0.8)]",
        "border border-[rgba(255,255,255,0.5)] dark:border-[rgba(255,255,255,0.1)]",
        "backdrop-blur-[14px] dark:backdrop-blur-[20px]",
      ].join(" ")}
      style={{
        WebkitBackdropFilter: "blur(14px)",
        boxShadow:
          "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 20px 40px -5px rgba(0, 0, 0, 0.10)",
      }}
      aria-label="Workspace command bar"
    >
      <div className="flex items-center self-center">{scanSlot}</div>
      <div className="h-5 w-px shrink-0 self-center bg-gray-300/50 dark:bg-white/10" aria-hidden />
      <div
        className="flex items-center gap-2 self-center"
        title="EzSay's own estimate of AI-pattern density — not your university's detector. Higher is better."
      >
        <span className="hidden text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500 sm:inline">
          Auditor
        </span>
        <AuditorScoreRing score={score} sizeClass="h-8 w-8" />
      </div>
    </div>
  );
}
