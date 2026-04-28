"use client";

import type { EventName } from "./constants";

/**
 * Client-side fire-and-forget event tracking.
 * Uses sendBeacon to survive page navigations.
 */
export function trackEvent(
  eventName: EventName,
  metadata?: Record<string, unknown>,
): void {
  const payload = JSON.stringify({ eventName, metadata });

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}
