import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleIntake, MAX_BODY_BYTES } from "@/lib/intake-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public lead intake for the website form. No sign-in: protection is the size cap, a zod
// contract, bot traps, Turnstile, and rate limits (see src/lib/intake-server.ts). The service
// role is used only to call the two service-role-only functions the form needs.
export async function POST(req: NextRequest) {
  // Refuse an oversized body before reading it.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "invalid", message: "Something was wrong with that request." }, { status: 413 });
  }
  const raw = await req.text();
  const out = await handleIntake(
    { db: createAdminClient(), env: process.env, fetch, now: () => new Date() },
    raw,
    req.headers,
  );
  return NextResponse.json(out.body, { status: out.status, headers: { "cache-control": "no-store", ...out.headers } });
}
