import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY. Bypasses RLS; used for storage
 * access to the private `originals` bucket (uploaded source files). Never
 * import from client components; user scoping must be enforced by the caller
 * (e.g. the documents.userId check in the export route).
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Private bucket holding the original uploaded files, path {userId}/{docId}.{ext}. */
export const ORIGINALS_BUCKET = "originals";
