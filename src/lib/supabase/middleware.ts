import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and guards routes.
 * Unauthenticated users are redirected to /login (except the login page and
 * inbound webhooks, which verify their own signatures).
 *
 * Uses getSession() rather than getUser() deliberately: getUser() makes a
 * network round-trip to Supabase's Auth API on every single request (measured
 * ~150-270ms), which is a flat tax on every navigation in the app. getSession()
 * reads the JWT from the cookie locally (only hitting the network to refresh
 * when the token has actually expired). This is safe here because middleware
 * is UX-only — the real security boundary is Row Level Security, which
 * PostgREST validates server-side against the JWT on every single query
 * regardless of what middleware decided (see lib/supabase/server.ts). A
 * tampered/forged cookie would still be rejected at the database layer.
 */
export async function updateSession(request: NextRequest) {
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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  // Public routes with their own auth: inbound webhooks verify signatures.
  const isPublicApi = pathname.startsWith("/api/webhooks");
  // The dev-only design reference renders static samples, no data.
  const isDevDesign = process.env.NODE_ENV !== "production" && pathname.startsWith("/design");

  if (!user && !isAuthRoute && !isPublicApi && !isDevDesign) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
