import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY convenience route. Signs the operator in using credentials from env
 * and redirects to the dashboard, so you can open the app already logged in.
 * Returns 404 in production — never a real auth path.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = process.env.MAKI_LOGIN_EMAIL;
  const password = process.env.MAKI_LOGIN_PASSWORD;
  if (!email || !password) {
    return new NextResponse(
      "Set MAKI_LOGIN_EMAIL and MAKI_LOGIN_PASSWORD in .env.local",
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return new NextResponse(`Login failed: ${error.message}`, { status: 401 });
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
