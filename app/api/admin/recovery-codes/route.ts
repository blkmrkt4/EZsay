import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminRecoveryCodes, profiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createHash, randomBytes } from "crypto";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // 8 character alphanumeric, grouped as XXXX-XXXX for readability
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 to avoid confusion
  let code = "";
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code.slice(0, 4) + "-" + code.slice(4);
}

/**
 * GET — list recovery codes (shows used/unused status, never the code itself)
 * POST action=generate — generates 10 new codes, returns them in plaintext ONCE
 * POST action=verify — checks a code, marks it used, returns admin session
 */

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const codes = await db
    .select({
      id: adminRecoveryCodes.id,
      used: adminRecoveryCodes.used,
      usedAt: adminRecoveryCodes.usedAt,
      createdAt: adminRecoveryCodes.createdAt,
    })
    .from(adminRecoveryCodes)
    .orderBy(adminRecoveryCodes.createdAt);

  const total = codes.length;
  const remaining = codes.filter((c) => !c.used).length;

  return NextResponse.json({
    success: true,
    data: { codes, total, remaining },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === "generate") {
    // Only admins can generate codes
    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // Delete all existing codes and generate fresh set
    await db.delete(adminRecoveryCodes);

    const plaintextCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = generateCode();
      plaintextCodes.push(code);
      await db.insert(adminRecoveryCodes).values({
        codeHash: hashCode(code),
      });
    }

    // Return plaintext codes — this is the ONLY time they are visible
    return NextResponse.json({
      success: true,
      data: {
        codes: plaintextCodes,
        message:
          "Save these codes somewhere safe. They will not be shown again.",
      },
    });
  }

  if (action === "verify") {
    // No auth required — this IS the recovery mechanism
    const { code } = body;
    if (!code) {
      return NextResponse.json(
        { success: false, error: "Code is required" },
        { status: 400 }
      );
    }

    const hash = hashCode(code.toUpperCase().trim());

    const [match] = await db
      .select()
      .from(adminRecoveryCodes)
      .where(
        and(
          eq(adminRecoveryCodes.codeHash, hash),
          eq(adminRecoveryCodes.used, false)
        )
      )
      .limit(1);

    if (!match) {
      return NextResponse.json(
        { success: false, error: "Invalid or already used code" },
        { status: 401 }
      );
    }

    // Mark code as used
    await db
      .update(adminRecoveryCodes)
      .set({ used: true, usedAt: new Date() })
      .where(eq(adminRecoveryCodes.id, match.id));

    // Find the admin user to return their ID for session creation
    const [admin] = await db
      .select({ id: profiles.id, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.role, "admin"))
      .limit(1);

    if (!admin) {
      return NextResponse.json(
        { success: false, error: "No admin account found" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        remainingCodes: await db
          .select()
          .from(adminRecoveryCodes)
          .where(eq(adminRecoveryCodes.used, false))
          .then((rows) => rows.length),
      },
    });
  }

  return NextResponse.json(
    { success: false, error: "Unknown action" },
    { status: 400 }
  );
}
