import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { financeContext } from "@/lib/finance-auth";
import { loadBid } from "@/lib/bids-data";
import { bidNumberLabel } from "@/lib/bids";
import { BidSheet } from "@/components/bids/bid-sheet";
import { PrintButton } from "@/components/invoices/print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bid", robots: { index: false, follow: false } };

/** A clean, printable bid (customer view: scope and price only). Use the browser's Print, then "Save as PDF". */
export default async function PrintBidPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) notFound();
  const bid = await loadBid(ctx.supabase, id);
  if (!bid || bid.versions.length === 0) notFound();
  const wanted = Number(v);
  const version = bid.versions.find((x) => x.version === wanted) ?? bid.versions[0];
  return (
    <div className="space-y-4">
      <div className="kc-print-hide flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{bidNumberLabel(bid.number)} · version {version.version} · print preview</p>
        <PrintButton />
      </div>
      <BidSheet paper bid={bid} version={version} />
    </div>
  );
}
