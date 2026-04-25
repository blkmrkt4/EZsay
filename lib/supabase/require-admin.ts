import { createClient } from "@/lib/supabase/server";
import { isDevBypass, getDevUser } from "@/lib/supabase/dev-auth";

/**
 * Checks that the current user is authenticated AND has admin role.
 * Returns the user on success, or an error object on failure.
 *
 * Usage in API routes:
 *   const auth = await requireAdmin();
 *   if ("error" in auth) {
 *     return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
 *   }
 *   const { user } = auth;
 */
export async function requireAdmin(): Promise<
  | { user: { id: string; email?: string | null } }
  | { error: string; status: number }
> {
  if (isDevBypass()) {
    return { user: getDevUser() };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Forbidden", status: 403 };

  return { user };
}
