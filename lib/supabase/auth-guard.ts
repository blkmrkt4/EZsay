import { createClient } from "@/lib/supabase/server";
import { isDevBypass, getDevUser } from "@/lib/supabase/dev-auth";

/**
 * Gets the current user. In dev bypass mode, returns a deterministic dev user
 * so you never have to log in during development.
 */
export async function getCurrentUser() {
  if (isDevBypass()) {
    return getDevUser();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
