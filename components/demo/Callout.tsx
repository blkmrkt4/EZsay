"use client";

import type { ReactNode } from "react";

/**
 * A positioned annotation marker drawn over a demo visual (mock component or
 * screenshot). Coordinates are percentages of the visual's box so they scale
 * with it. Used to point at regions like "Edit pane" / "Choices pane".
 */
export interface CalloutSpec {
  /** Small number badge (matches the order things are introduced). */
  n?: number;
  /** Short label shown in the pill. */
  label: string;
  /** Percent from the left edge of the visual (0–100). */
  x: number;
  /** Percent from the top edge of the visual (0–100). */
  y: number;
  /** Which side the pill sits relative to the anchor dot. */
  side?: "top" | "bottom" | "left" | "right";
}

export default function Callout({ n, label, x, y, side = "bottom" }: CalloutSpec) {
  // Pill offset relative to the anchor dot.
  const pillPos: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
    >
      {/* Pulsing anchor dot */}
      <span className="relative flex h-4 w-4">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-300 opacity-75" />
        <span className="relative inline-flex h-4 w-4 rounded-full bg-yellow-300 ring-2 ring-gray-900" />
      </span>

      {/* Label pill */}
      <span
        className={`absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white shadow-lg ${pillPos[side]}`}
      >
        {n != null && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-300 text-[10px] font-bold text-gray-900">
            {n}
          </span>
        )}
        {label}
      </span>
    </div>
  );
}

/** Wraps a visual and overlays an array of callout markers. */
export function CalloutLayer({
  children,
  callouts,
}: {
  children: ReactNode;
  callouts?: CalloutSpec[];
}) {
  return (
    <div className="relative h-full w-full">
      {children}
      {callouts?.map((c, i) => (
        <Callout key={i} {...c} />
      ))}
    </div>
  );
}
