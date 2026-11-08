"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/actions/projects";
import { percentInputToBps } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassPanel } from "@/components/system/glass-panel";
import { useFinanceAction } from "@/components/invoices/use-finance-action";
import type { BidDetail } from "@/lib/bids-data";

/** Won it? Turn a sent bid into a project: the bid's price becomes the contract and the deposit share is set here. */
export function BidProjectPanel({ bid }: { bid: BidDetail }) {
  const router = useRouter();
  const { run, pending } = useFinanceAction();
  const [title, setTitle] = useState(bid.title);
  const [deposit, setDeposit] = useState("30");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (bid.projectId) {
    return (
      <GlassPanel as="section" aria-label="Project" className="space-y-3 p-5">
        <h2 className="font-heading text-base font-medium text-ink">Won</h2>
        <Button render={<Link href={`/projects/${bid.projectId}`} />} className="h-11 w-full md:h-9" data-testid="bid-open-project">Open the project</Button>
      </GlassPanel>
    );
  }
  if (bid.status !== "sent") return null;

  function create() {
    const bps = percentInputToBps(deposit);
    if (bps === null || bps > 10000) return setError("The deposit is a percentage from 0 to 100, like 30.");
    setError(null);
    run(
      () => createProject({ bidId: bid.id, expectedUpdatedAt: bid.updatedAt, title, depositBps: bps, startsOn: startsOn || undefined, endsOn: endsOn || undefined }),
      "Project created. The opportunity is now Won.",
      (r) => router.push(`/projects/${r.projectId}`),
      (m) => setError(m),
    );
  }
  return (
    <GlassPanel as="section" aria-label="Won this bid" className="space-y-3 p-5" data-testid="bid-project-panel">
      <h2 className="font-heading text-base font-medium text-ink">Won this bid?</h2>
      <p className="text-[13px] text-ink-muted">Creates the project at this bid&apos;s price and marks the opportunity Won.</p>
      <div className="space-y-1.5"><Label htmlFor="pj-new-title" className="text-[12px] text-ink-muted">Project name</Label><Input id="pj-new-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 md:h-9" /></div>
      <div className="space-y-1.5"><Label htmlFor="pj-new-deposit" className="text-[12px] text-ink-muted">Deposit (% of the contract)</Label><Input id="pj-new-deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="h-11 md:h-9" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="pj-new-start" className="text-[12px] text-ink-muted">Planned start</Label><Input id="pj-new-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-11 md:h-9" /></div>
        <div className="space-y-1.5"><Label htmlFor="pj-new-end" className="text-[12px] text-ink-muted">Planned end</Label><Input id="pj-new-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="h-11 md:h-9" /></div>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <Button type="button" onClick={create} disabled={pending || title.trim() === ""} className="h-11 w-full md:h-9" data-testid="bid-create-project">Create the project</Button>
    </GlassPanel>
  );
}
