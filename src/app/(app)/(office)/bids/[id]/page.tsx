import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { loadBid } from "@/lib/bids-data";
import { bidNumberLabel } from "@/lib/bids";
import { loadPricingRules } from "@/lib/pricing-data";
import { PageHeader } from "@/components/shell/page-header";
import { GlassPanel } from "@/components/system/glass-panel";
import { BidBuilder } from "@/components/bids/bid-builder";

export const metadata: Metadata = { title: "Bid" };
export const dynamic = "force-dynamic";

/** Owner and admin: one bid, its versions, and its status. */
export default async function BidPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/leads");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [bid, rules] = await Promise.all([loadBid(ctx.supabase, id.data), loadPricingRules(ctx.supabase)]);
  if (!bid) notFound();
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <Link href={`/leads?lead=${bid.leadId}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Pipeline
      </Link>
      <PageHeader eyebrow={bidNumberLabel(bid.number)} title={bid.title} description={`For ${bid.accountName}.`} />
      {rules ? (
        <BidBuilder key={`${bid.id}-${bid.currentVersion}-${bid.updatedAt}`} rules={rules} bid={bid} lead={{ id: bid.leadId, name: bid.contact.name, stage: bid.leadStage, accountName: bid.accountName, hasBid: bid.id, serviceType: "commercial" }} />
      ) : (
        <GlassPanel className="p-5 text-sm text-ink-muted">Pricing rules couldn&apos;t be loaded. Try again in a moment.</GlassPanel>
      )}
    </div>
  );
}
