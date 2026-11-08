import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { loadLeadForBid } from "@/lib/bids-data";
import { loadPricingRules } from "@/lib/pricing-data";
import { PageHeader } from "@/components/shell/page-header";
import { GlassPanel } from "@/components/system/glass-panel";
import { BidBuilder } from "@/components/bids/bid-builder";

export const metadata: Metadata = { title: "New bid" };
export const dynamic = "force-dynamic";

/** Owner and admin: start a bid for an opportunity (?lead=<id>). */
export default async function NewBidPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/leads");
  const leadId = z.string().uuid().safeParse((await searchParams).lead);
  if (!leadId.success) notFound();
  const [lead, rules] = await Promise.all([loadLeadForBid(ctx.supabase, leadId.data), loadPricingRules(ctx.supabase)]);
  if (!lead) notFound();
  if (lead.hasBid) redirect(`/bids/${lead.hasBid}`);
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <Link href={`/leads?lead=${lead.id}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Pipeline
      </Link>
      <PageHeader eyebrow="Bids" title="New bid" description={`For ${lead.accountName ?? lead.name}.`} />
      {rules ? <BidBuilder rules={rules} bid={null} lead={lead} /> : <GlassPanel className="p-5 text-sm text-ink-muted">Pricing rules couldn&apos;t be loaded. Try again in a moment.</GlassPanel>}
    </div>
  );
}
