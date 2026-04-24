"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type HeatmapFlagKind = "ai" | "plagiarism" | "artifact" | "citation" | "tone";

export interface HeatmapTick {
  id: string;
  sectionId: string;
  kind: HeatmapFlagKind;
  label?: string;
}

interface HeatmapScrollbarProps {
  /** Ref to the scroll container that renders the document sections. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** All flags/issues to show as ticks. One entry per tick. */
  ticks: HeatmapTick[];
  /** Click → scroll the document to that section. */
  onNavigate: (sectionId: string) => void;
  /** Optional highlight — the section currently being reviewed. */
  activeSectionId?: string | null;
}

const KIND_COLORS: Record<HeatmapFlagKind, string> = {
  ai: "#f59e0b",          // amber — AI Detection
  plagiarism: "#ef4444",  // red — plagiarism
  artifact: "#a855f7",    // purple — AI artifacts
  citation: "#3b82f6",    // blue — citation issues
  tone: "#14b8a6",        // teal — tone consistency
};

const KIND_LABELS: Record<HeatmapFlagKind, string> = {
  ai: "AI Detection",
  plagiarism: "Plagiarism",
  artifact: "Artifact",
  citation: "Citation",
  tone: "Tone",
};

/**
 * Thin vertical strip that mirrors the doc scroll area. Each flag renders as
 * a coloured tick at its section's proportional y-position. Clicking a tick
 * scrolls the document to that section.
 *
 * Positions are recomputed whenever the container resizes or content changes,
 * so the ticks stay accurate as the user edits or panels resize.
 */
export default function HeatmapScrollbar({
  scrollRef,
  ticks,
  onNavigate,
  activeSectionId,
}: HeatmapScrollbarProps) {
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [viewport, setViewport] = useState<{ top: number; height: number }>({ top: 0, height: 1 });
  const heatmapRef = useRef<HTMLDivElement>(null);

  // Measure each section's relative position and the viewport's current
  // scroll/visibility window. Re-runs whenever the container resizes or its
  // children change (sections added/removed, content edited, etc.).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const measure = () => {
      const scrollHeight = Math.max(container.scrollHeight, 1);
      const newPositions: Record<string, number> = {};
      container.querySelectorAll<HTMLElement>("[data-section-id]").forEach((el) => {
        const sectionId = el.dataset.sectionId;
        if (!sectionId) return;
        const mid = el.offsetTop + el.offsetHeight / 2;
        newPositions[sectionId] = Math.min(1, Math.max(0, mid / scrollHeight));
      });
      setPositions(newPositions);
      setViewport({
        top: container.scrollTop / scrollHeight,
        height: container.clientHeight / scrollHeight,
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);

    const mo = new MutationObserver(measure);
    mo.observe(container, { childList: true, subtree: true, characterData: true });

    container.addEventListener("scroll", measure, { passive: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
      container.removeEventListener("scroll", measure);
    };
  }, [scrollRef]);

  const handleTickClick = (sectionId: string) => {
    onNavigate(sectionId);
    const el = scrollRef.current?.querySelector(`[data-section-id="${sectionId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div
      ref={heatmapRef}
      className="relative w-2.5 shrink-0 border-l border-gray-100 bg-gray-50/50"
      aria-label="Document flag heatmap"
    >
      {/* Viewport shadow — shows which slice of the document is currently visible */}
      <div
        className="pointer-events-none absolute inset-x-0 rounded-sm bg-gray-900/10"
        style={{
          top: `${viewport.top * 100}%`,
          height: `${Math.max(viewport.height * 100, 2)}%`,
          transition: "top 120ms linear, height 120ms linear",
        }}
      />

      {/* Ticks */}
      {ticks.map((tick) => {
        const pos = positions[tick.sectionId];
        if (pos === undefined) return null;
        const isActive = activeSectionId === tick.sectionId;
        return (
          <button
            key={tick.id}
            onClick={() => handleTickClick(tick.sectionId)}
            title={`${KIND_LABELS[tick.kind]}${tick.label ? ` — ${tick.label}` : ""}`}
            aria-label={`Jump to ${KIND_LABELS[tick.kind]} flag`}
            className="absolute left-1/2 -translate-x-1/2 cursor-pointer rounded-full transition-transform hover:scale-125"
            style={{
              top: `${pos * 100}%`,
              transform: `translate(-50%, -50%) ${isActive ? "scale(1.4)" : ""}`,
              width: isActive ? "10px" : "7px",
              height: "2.5px",
              backgroundColor: KIND_COLORS[tick.kind],
              boxShadow: isActive ? `0 0 4px ${KIND_COLORS[tick.kind]}` : "none",
            }}
          />
        );
      })}
    </div>
  );
}
