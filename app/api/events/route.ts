import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { db } from "@/db";
import { events } from "@/db/schema";
import { EVENT_CATALOG, type EventName } from "@/lib/events/constants";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  const key = user ? `events:${user.id}` : `events:anon`;
  const rl = rateLimit(key, 60, 60_000);
  if (rl.limited) {
    return new NextResponse(null, { status: 429 });
  }

  try {
    const { eventName, metadata } = await request.json();

    if (!eventName || !(eventName in EVENT_CATALOG)) {
      return new NextResponse(null, { status: 400 });
    }

    const category = EVENT_CATALOG[eventName as EventName];

    db.insert(events)
      .values({
        userId: user?.id ?? null,
        eventName,
        category,
        metadata: metadata ?? {},
      })
      .catch((err) => console.error(`[events API] Insert failed:`, err));

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
