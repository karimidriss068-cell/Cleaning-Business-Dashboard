import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOpenAccess } from "@/lib/open-access";

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
  // Public routes with their own auth: inbound webhooks verify signatures,
  // cron routes check CRON_SECRET, the read-only growth snapshot checks GROWTH_API_KEY, and the customer pay / save-card pages are
  // reached by an unguessable token in the link, and the lead form is open to the public by design.
  const isPublicApi =
    pathname.startsWith("/api/webhooks") || pathname.startsWith("/api/cron") || pathname.startsWith("/api/growth/") || pathname.startsWith("/pay/") || pathname.startsWith("/card/") ||
    // The website lead form, its API (zod, Turnstile and rate limits), and the script that embeds it.
    pathname === "/lead-form" || pathname.startsWith("/api/public/") || pathname === "/embed.js";
  // The dev-only design reference renders static samples, no data.
  const isDevDesign = process.env.NODE_ENV !== "production" && pathname.startsWith("/design");

  const isOpenAccessRoute = pathname.startsWith("/api/open-access");
  if (isOpenAccessRoute) return supabaseResponse;

  // Open-access mode: auto-sign visitors in as the owner (no loop: login?open=failed is left alone).
  if (!user && isOpenAccess() && !isPublicApi && !isDevDesign && request.nextUrl.searchParams.get("open") !== "failed") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/open-access";
    url.search = isAuthRoute ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (!user && !isAuthRoute && !isPublicApi && !isDevDesign) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/command-center";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
