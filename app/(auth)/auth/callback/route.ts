import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/stripe/ensure-profile";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") || "/w";
  const plan = searchParams.get("plan");
  const billing = searchParams.get("billing");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Ensure profile row exists
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await ensureProfile(user.id, user.email ?? "");
      }

      // Forward plan/billing params if coming from pricing page
      let target = redirect;
      if (plan && billing) {
        const sep = target.includes("?") ? "&" : "?";
        target = `${target}${sep}plan=${plan}&billing=${billing}`;
      }

      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
