import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOpenAccess } from "@/lib/open-access";

export const dynamic = "force-dynamic";

async function resolveOwnerEmail(): Promise<string | null> {
  const admin = createAdminClient();
  if (process.env.OPEN_ACCESS_EMAIL) return process.env.OPEN_ACCESS_EMAIL;
  let userId = process.env.OPEN_ACCESS_USER_ID ?? null;
  if (!userId) {
    for (const role of ["owner", "admin"] as const) {
      const { data } = await admin.from("profiles").select("user_id").eq("role", role).eq("is_active", true).order("created_at").limit(1);
      if (data?.[0]) { userId = data[0].user_id; break; }
    }
  }
  if (!userId) return null;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

/** Signs the visitor in as the owner account (magic-link token verified server-side) and sets the SSR auth cookies. */
export async function GET(request: NextRequest) {
  if (!isOpenAccess()) return new NextResponse("Not found", { status: 404 });

  const email = await resolveOwnerEmail();
  if (!email) {
    console.error("[open-access] No owner/admin user found; set OPEN_ACCESS_EMAIL or OPEN_ACCESS_USER_ID.");
    return NextResponse.redirect(new URL("/login?open=failed", request.url));
  }

  const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link?.properties?.hashed_token) {
    console.error("[open-access] generateLink failed", linkError);
    return NextResponse.redirect(new URL("/login?open=failed", request.url));
  }

  const next = request.nextUrl.searchParams.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api/open-access") ? next : "/command-center";
  const response = NextResponse.redirect(new URL(dest, request.url));

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error) {
    console.error("[open-access] verifyOtp failed", error);
    return NextResponse.redirect(new URL("/login?open=failed", request.url));
  }
  return response;
}
