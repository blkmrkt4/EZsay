import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dev bypass — skip all auth checks in development
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_BYPASS_AUTH === "true"
  ) {
    // Let everything through except admin (still needs role check in layout)
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes — redirect unauthenticated users to login
  const protectedPrefixes = ["/w", "/upload", "/results", "/edit", "/dashboard", "/scan"];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Admin routes — require admin role (defense-in-depth, layout also checks)
  if (pathname.startsWith("/admin")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Check admin role via profiles table
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/w";
      return NextResponse.redirect(url);
    }
  }

  // Redirect logged-in users away from auth pages
  const authPaths = ["/login", "/signup"];
  if (user && authPaths.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/w";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
