import { db } from "@/db";
import { events } from "@/db/schema";
import { EVENT_CATALOG, type EventName } from "./constants";

/**
 * Fire-and-forget server-side event tracking.
 * Never throws — errors are logged but never propagated.
 */
export function trackEvent(
  eventName: EventName,
  userId: string | null,
  metadata?: Record<string, unknown>,
): void {
  const category = EVENT_CATALOG[eventName];

  db.insert(events)
    .values({
      userId,
      eventName,
      category,
      metadata: metadata ?? {},
    })
    .then(() => {})
    .catch((err) => {
      console.error(`[events] Failed to track ${eventName}:`, err);
    });
}
