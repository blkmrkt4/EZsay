"use client";

import { useEffect, useRef, useState } from "react";

interface AuditorScoreRingProps {
  score: number | null;
  /** Tailwind size class for the outer box. Default h-10 w-10. */
  sizeClass?: string;
}

const RADIUS = 20;
const STROKE = 1.25; // thinned ~17% from 1.5 for a more elegant gauge
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Three tiers per spec: Danger / Warning / Safe
function colorForScore(score: number): { stroke: string; glow: string } {
  if (score >= 80) return { stroke: "#10B981", glow: "rgba(16, 185, 129, 0.55)" };   // Emerald — Safe
  if (score >= 40) return { stroke: "#FACC15", glow: "rgba(250, 204, 21, 0.55)" };   // Amber — Warning
  return { stroke: "#F87171", glow: "rgba(248, 113, 113, 0.55)" };                   // Coral — Danger
}

/**
 * Circular progress ring for the Auditor Score. When `score` changes:
 *  - the ring stroke animates to the new offset
 *  - the center number counts up from the previously-displayed value
 *  - a brief glow pulse marks the change
 */
export default function AuditorScoreRing({ score, sizeClass = "h-10 w-10" }: AuditorScoreRingProps) {
  const [displayed, setDisplayed] = useState<number>(score ?? 0);
  const [pulsing, setPulsing] = useState(false);
  const rafRef = useRef<number | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (score === null) {
      setDisplayed(0);
      return;
    }

    const start = displayed;
    const end = score;
    if (start === end) return;

    setPulsing(true);
    const duration = 800;
    const t0 = performance.now();

    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(Math.round(start + (end - start) * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    pulseTimeoutRef.current = setTimeout(() => setPulsing(false), 1100);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const safeScore = score === null ? 0 : Math.max(0, Math.min(100, displayed));
  const { stroke, glow } = colorForScore(safeScore);
  const offset = CIRCUMFERENCE * (1 - safeScore / 100);

  // Always-on soft glow matching the ring colour; a stronger glow is layered
  // on during the pulse window for a brief luminous bloom when the score changes.
  const baseGlow = `drop-shadow(0 0 2px ${stroke})`;
  const pulseGlow = `drop-shadow(0 0 2px ${stroke}) drop-shadow(0 0 8px ${glow})`;

  return (
    <div
      className={`relative ${sizeClass}`}
      aria-label={score === null ? "Auditor score pending" : `Auditor score ${score}`}
    >
      <svg
        className="h-full w-full -rotate-90"
        viewBox="0 0 48 48"
        style={{
          filter: pulsing ? pulseGlow : baseGlow,
          transition: "filter 300ms ease-out",
        }}
      >
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="rgba(15, 23, 42, 0.08)"
          strokeWidth={STROKE}
        />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition:
              "stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1), stroke 500ms ease-out",
          }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold text-gray-900 tabular-nums"
          style={{ fontSize: "11px", lineHeight: 1, transform: "translateY(0.5px)" }}
        >
          {score === null ? "—" : displayed}
        </span>
      </div>
    </div>
  );
}
