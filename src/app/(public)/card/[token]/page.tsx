import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { payTokenSchema } from "@/lib/schemas/finance";
import { GlassPanel } from "@/components/system/glass-panel";
import { CardSetupPanel } from "@/components/invoices/pay-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Save a card", robots: { index: false, follow: false } };

const requestSchema = z.object({ customer: z.string().nullable(), expired: z.boolean(), used: z.boolean() });

/** Lets a customer save a card on file. Reached only by the unguessable link; nothing is charged. */
export default async function CardPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { token } = await params;
  if (!payTokenSchema.safeParse(token).success) notFound();
  const { data, error } = await createAdminClient().rpc("card_request_for_token", { p_token: token });
  const parsed = requestSchema.safeParse(data);
  if (error || !parsed.success) notFound();
  const sp = await searchParams;
  const { customer, expired, used } = parsed.data;

  if (sp.saved === "1" || used) {
    return (
      <GlassPanel level="modal" className="flex items-start gap-3 p-6 text-ink">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div>
          <h1 className="font-heading text-2xl font-semibold">Your card is saved</h1>
          <p className="mt-1 text-sm text-ink-muted">Thank you. It will only be charged for your cleaning, on the day of the visit.</p>
        </div>
      </GlassPanel>
    );
  }
  if (expired) {
    return (
      <GlassPanel level="modal" className="flex items-start gap-3 p-6 text-ink">
        <Info className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
        <div>
          <h1 className="font-heading text-2xl font-semibold">This link has expired</h1>
          <p className="mt-1 text-sm text-ink-muted">Ask us for a new one and we&apos;ll send it right over.</p>
        </div>
      </GlassPanel>
    );
  }
  return <CardSetupPanel token={token} customer={customer ?? ""} />;
}
