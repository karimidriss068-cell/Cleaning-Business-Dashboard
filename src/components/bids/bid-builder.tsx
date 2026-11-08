"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Printer, Trash2 } from "lucide-react";
import { saveBid, setBidStatus } from "@/app/actions/bids";
import { computeBid } from "@/lib/bids";
import { formatCalendarDate, formatCents, formatNyDateTime, nyToday, addDays } from "@/lib/format";
import { bpsToPercentInput, centsToDollarInput, dollarInputToCents, percentInputToBps } from "@/lib/pricing";
import { bidInputsSchema, type BidInputs } from "@/lib/schemas/bids";
import { SPACE_TYPES, spaceTypeLabel, type PricingSnapshot, type SpaceType } from "@/lib/schemas/pricing";
import { bidLabel, bidTone } from "@/lib/status";
import type { BidDetail, BidLead } from "@/lib/bids-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { useFinanceAction } from "@/components/invoices/use-finance-action";
import { BidProjectPanel } from "./bid-project-panel";

type AreaDraft = { key: number; label: string; spaceType: SpaceType; sqft: string };
type Draft = {
  title: string;
  company: string;
  areas: AreaDraft[];
  cleans: string;
  crewSize: string;
  rush: boolean;
  laborRate: string;
  materials: string;
  margin: string;
  price: string;
  scopeNotes: string;
  reason: string;
};

const spaceItems = SPACE_TYPES.map((t) => ({ value: t, label: spaceTypeLabel[t] }));
let nextKey = 1;

function draftFrom(inputs: BidInputs | null, title: string, rules: PricingSnapshot, company: string): Draft {
  const o = inputs?.overrides ?? {};
  return {
    title,
    company,
    areas: (inputs?.areas ?? [{ label: "Main floor", spaceType: "office" as SpaceType, sqft: 0 }]).map((a) => ({ key: nextKey++, label: a.label, spaceType: a.spaceType, sqft: a.sqft ? String(a.sqft) : "" })),
    cleans: String(inputs?.cleans ?? 1),
    crewSize: String(inputs?.crewSize ?? rules.crewSizeDefault),
    rush: inputs?.rush ?? false,
    laborRate: o.laborRateCents == null ? "" : centsToDollarInput(o.laborRateCents),
    materials: o.materialsCents == null ? "" : centsToDollarInput(o.materialsCents),
    margin: o.marginTargetBps == null ? "" : bpsToPercentInput(o.marginTargetBps),
    price: o.priceCents == null ? "" : centsToDollarInput(o.priceCents),
    scopeNotes: inputs?.scopeNotes ?? "",
    reason: "",
  };
}

/** Turns what is typed into bid inputs, or says what is wrong. Blank override boxes mean "use the rules". */
function toInputs(d: Draft): { inputs: BidInputs } | { error: string } {
  const dollars = (t: string): number | null | undefined => (t.trim() === "" ? undefined : dollarInputToCents(t));
  const labor = dollars(d.laborRate), mats = dollars(d.materials), price = dollars(d.price);
  const margin = d.margin.trim() === "" ? undefined : percentInputToBps(d.margin);
  if (labor === null) return { error: "Labor cost per hour should be dollars, like 27.50" };
  if (mats === null) return { error: "Supplies should be dollars, like 400" };
  if (price === null) return { error: "The price should be dollars, like 7500" };
  if (margin === null) return { error: "Margin target should be a percentage, like 30" };
  const parsed = bidInputsSchema.safeParse({
    areas: d.areas.map((a) => ({ label: a.label, spaceType: a.spaceType, sqft: a.sqft.trim() === "" ? 0 : Number(a.sqft.replace(/,/g, "")) })),
    cleans: Number(d.cleans),
    crewSize: Number(d.crewSize),
    rush: d.rush,
    overrides: { laborRateCents: labor ?? null, materialsCents: mats ?? null, marginTargetBps: margin ?? null, priceCents: price ?? null },
    ...(d.scopeNotes.trim() ? { scopeNotes: d.scopeNotes } : {}),
  });
  return parsed.success ? { inputs: parsed.data } : { error: parsed.error.issues[0]?.message ?? "Check the bid" };
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/**
 * The bid builder: scope in, a priced bid out, live as you type. Saving never overwrites: each save is a
 * new numbered version. Cost and margin are for you only; the printed bid shows scope and price.
 */
export function BidBuilder({ rules, bid, lead }: { rules: PricingSnapshot; bid: BidDetail | null; lead: BidLead }) {
  const router = useRouter();
  const { run, pending } = useFinanceAction();
  const latest = bid?.versions[0] ?? null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(latest?.inputs ?? null, bid?.title ?? `${lead.name} bid`, rules, lead.accountName ?? ""));
  const [validUntil, setValidUntil] = useState(() => bid?.validUntil ?? addDays(nyToday(), 30));
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const closed = bid ? ["won", "lost", "expired"].includes(bid.status) : false;

  const parsed = useMemo(() => toInputs(draft), [draft]);
  const result = useMemo(() => {
    if ("error" in parsed) return null;
    try {
      return computeBid(parsed.inputs, rules);
    } catch {
      return null;
    }
  }, [parsed, rules]);
  const noArea = "inputs" in parsed && parsed.inputs.areas.some((a) => a.sqft < 1);
  const needsReason = result?.belowFloor ?? false;
  const reasonOk = !needsReason || draft.reason.trim().length >= 3;
  const dirty = latest === null || JSON.stringify("inputs" in parsed ? parsed.inputs : null) !== JSON.stringify(latest.inputs) || draft.title !== bid?.title;
  const canSave = !closed && !pending && result !== null && !noArea && reasonOk && draft.title.trim() !== "";

  function save() {
    if (!("inputs" in parsed)) return setFormError(parsed.error);
    setFormError(null);
    run(
      () => saveBid({
        title: draft.title,
        inputs: parsed.inputs,
        expectedRulesVersion: rules.version,
        bidId: bid?.id,
        leadId: bid ? undefined : lead.id,
        companyName: bid ? undefined : draft.company || undefined,
        expectedVersion: bid ? bid.currentVersion : undefined,
        floorOverrideReason: needsReason ? draft.reason : undefined,
      }),
      (r) => `Saved version ${r.version}`,
      (r) => {
        if (!bid) router.replace(`/bids/${r.bidId}`);
      },
      (m) => setFormError(m),
    );
  }
  function status(to: "ready" | "draft" | "sent") {
    if (!bid) return;
    run(() => setBidStatus({ bidId: bid.id, status: to, expectedUpdatedAt: bid.updatedAt, validUntil: to === "sent" ? validUntil : undefined }), to === "sent" ? "Marked as sent. The opportunity moved to Bid sent." : to === "ready" ? "Marked ready to send" : "Back to draft", undefined, (m) => setFormError(m));
  }

  const confirmedNote = !rules.confirmed;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="min-w-0 space-y-6" noValidate aria-label="Bid details">
        {confirmedNote && (
          <p role="status" className="rounded-md border border-warning-fill/50 bg-warning-soft p-3 text-sm text-ink" data-testid="bid-placeholder-note">
            Your pricing rules are still placeholders, so costs and margins here are guesses. <Link href="/settings/pricing" className="font-medium underline">Confirm them first</Link>.
          </p>
        )}
        <GlassPanel as="section" aria-labelledby="bid-basics" className="space-y-4 p-5 md:p-6">
          <h2 id="bid-basics" className="font-heading text-lg font-medium text-ink">The job</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bid-title">Bid title</Label>
              <Input id="bid-title" value={draft.title} onChange={(e) => set("title", e.target.value)} disabled={closed} className="h-11 md:h-9" />
            </div>
            {!bid && (
              <div className="space-y-1.5">
                <Label htmlFor="bid-company">Company</Label>
                <Input id="bid-company" value={draft.company} onChange={(e) => set("company", e.target.value)} placeholder={lead.name} disabled={lead.accountName !== null} className="h-11 md:h-9" />
                <p className="text-[12px] text-ink-muted">{lead.accountName ? "Already on this account." : "Creates the company account for this bid."}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bid-cleans">Number of cleans</Label>
              <Input id="bid-cleans" inputMode="numeric" value={draft.cleans} onChange={(e) => set("cleans", e.target.value)} disabled={closed} className="h-11 md:h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-crew">Crew size (people)</Label>
              <Input id="bid-crew" inputMode="numeric" value={draft.crewSize} onChange={(e) => set("crewSize", e.target.value)} disabled={closed} className="h-11 md:h-9" />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input type="checkbox" checked={draft.rush} onChange={(e) => set("rush", e.target.checked)} disabled={closed} className="size-4 accent-[var(--kc-accent)]" /> Rush job (priced at {pct(rules.rushMultiplierBps)} of normal)
          </label>
        </GlassPanel>

        <GlassPanel as="section" aria-labelledby="bid-scope" className="space-y-4 p-5 md:p-6">
          <div>
            <h2 id="bid-scope" className="font-heading text-lg font-medium text-ink">Scope</h2>
            <p className="text-[13px] text-ink-muted">One row for each kind of space. Hours come from your sq ft per cleaner-hour for that kind of space.</p>
          </div>
          <ul className="space-y-3">
            {draft.areas.map((a, i) => (
              <li key={a.key} className="grid gap-3 md:grid-cols-[1fr_11rem_8rem_auto] md:items-end" data-testid="bid-area">
                <div className="space-y-1.5">
                  <Label htmlFor={`area-label-${a.key}`} className="text-[12px] text-ink-muted">Area</Label>
                  <Input id={`area-label-${a.key}`} value={a.label} onChange={(e) => set("areas", draft.areas.map((x) => (x.key === a.key ? { ...x, label: e.target.value } : x)))} disabled={closed} className="h-11 md:h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] text-ink-muted">Kind of space</Label>
                  <Select items={spaceItems} value={a.spaceType} onValueChange={(v) => v && set("areas", draft.areas.map((x) => (x.key === a.key ? { ...x, spaceType: v as SpaceType } : x)))} disabled={closed}>
                    <SelectTrigger className="h-11 w-full md:h-9" aria-label={`Kind of space for ${a.label || `area ${i + 1}`}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{spaceItems.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`area-sqft-${a.key}`} className="text-[12px] text-ink-muted">Square feet</Label>
                  <Input id={`area-sqft-${a.key}`} inputMode="numeric" value={a.sqft} onChange={(e) => set("areas", draft.areas.map((x) => (x.key === a.key ? { ...x, sqft: e.target.value } : x)))} disabled={closed} className="h-11 md:h-9" />
                </div>
                <Button type="button" variant="ghost" onClick={() => set("areas", draft.areas.filter((x) => x.key !== a.key))} disabled={closed || draft.areas.length === 1} aria-label={`Remove ${a.label || `area ${i + 1}`}`} className="h-11 md:h-9">
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" onClick={() => set("areas", [...draft.areas, { key: nextKey++, label: `Area ${draft.areas.length + 1}`, spaceType: "office", sqft: "" }])} disabled={closed || draft.areas.length >= 40} className="h-11 md:h-9">
            <Plus aria-hidden /> Add an area
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor="bid-notes">What the customer reads under the scope (optional)</Label>
            <Textarea id="bid-notes" value={draft.scopeNotes} onChange={(e) => set("scopeNotes", e.target.value)} disabled={closed} placeholder="Daily trash removal, restrooms restocked, floors machine-scrubbed…" />
          </div>
        </GlassPanel>

        <GlassPanel as="section" aria-labelledby="bid-over" className="space-y-4 p-5 md:p-6">
          <div>
            <h2 id="bid-over" className="font-heading text-lg font-medium text-ink">Adjust for this bid</h2>
            <p className="text-[13px] text-ink-muted">Leave a box empty to use your pricing rules.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ov-labor">Labor cost per cleaner-hour ($)</Label><Input id="ov-labor" inputMode="decimal" value={draft.laborRate} onChange={(e) => set("laborRate", e.target.value)} placeholder={centsToDollarInput(rules.laborRateCents)} disabled={closed} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="ov-mat">Supplies and equipment ($)</Label><Input id="ov-mat" inputMode="decimal" value={draft.materials} onChange={(e) => set("materials", e.target.value)} placeholder={result ? centsToDollarInput(result.costLines[1]?.cents ?? 0) : ""} disabled={closed} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="ov-margin">Margin target (%)</Label><Input id="ov-margin" inputMode="decimal" value={draft.margin} onChange={(e) => set("margin", e.target.value)} placeholder={bpsToPercentInput(rules.marginTargetBps)} disabled={closed} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="ov-price">Charge this price instead ($)</Label><Input id="ov-price" inputMode="decimal" value={draft.price} onChange={(e) => set("price", e.target.value)} placeholder={result ? centsToDollarInput(result.suggestedPriceCents) : ""} disabled={closed} className="h-11 md:h-9" /></div>
          </div>
        </GlassPanel>
      </form>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Price and margin">
        <GlassPanel as="section" aria-label="Price" className="space-y-3 p-5" data-testid="bid-summary">
          {bid && <div className="flex items-center gap-2"><StatusPill tone={bidTone(bid.status)}>{bidLabel[bid.status]}</StatusPill><span className="text-[13px] text-ink-muted">Bid {bid.number} · version {bid.currentVersion}</span></div>}
          {result ? (
            <>
              <p className="text-[12px] text-ink-muted">Price to charge{result.priceOverridden ? " (your price)" : ""}</p>
              <p className="font-heading text-4xl font-semibold text-ink tabular" data-testid="bid-price">{formatCents(result.priceCents, { hideZeroCents: true })}</p>
              <p className="text-sm" data-testid="bid-margin">
                <span className="text-ink tabular">{pct(result.marginBps)} margin</span>{" "}
                <StatusPill tone={result.belowFloor ? "danger" : result.belowTarget ? "warning" : "success"}>{result.belowFloor ? "Below your floor" : result.belowTarget ? "Below target" : "On target"}</StatusPill>
              </p>
              <dl className="space-y-1 border-t border-hairline pt-3 text-[13px]">
                {result.costLines.map((l) => (<div key={l.label} className="flex justify-between gap-3"><dt className="text-ink-muted">{l.label}</dt><dd className="text-ink tabular">{formatCents(l.cents, { hideZeroCents: true })}</dd></div>))}
                <div className="flex justify-between gap-3 font-medium"><dt className="text-ink">Your cost</dt><dd className="text-ink tabular">{formatCents(result.costCents, { hideZeroCents: true })}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Cleaner-hours</dt><dd className="text-ink tabular">{result.totalHours.toFixed(1)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Hours on site per person</dt><dd className="text-ink tabular">{result.onSiteHoursPerPerson.toFixed(1)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Price for {pct(result.marginTargetBps)} margin</dt><dd className="text-ink tabular">{formatCents(result.targetPriceCents, { hideZeroCents: true })}</dd></div>
                {result.minimumApplied && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Your minimum project</dt><dd className="text-ink tabular">{formatCents(rules.minimumProjectCents, { hideZeroCents: true })}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Rate-card price</dt><dd className="text-ink tabular">{formatCents(result.listPriceCents, { hideZeroCents: true })}</dd></div>
              </dl>
              {needsReason && (
                <div className="space-y-1.5 border-t border-hairline pt-3">
                  <Label htmlFor="bid-reason">Why is this below your {pct(rules.marginFloorBps)} floor?</Label>
                  <Textarea id="bid-reason" value={draft.reason} onChange={(e) => set("reason", e.target.value)} disabled={closed} />
                  <p className="text-[12px] text-ink-muted">Saved with this version.</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-muted">{"error" in parsed ? parsed.error : noArea ? "Enter the square feet for every area." : "Fill in the scope to see the price."}</p>
          )}
          {noArea && result && <p className="text-[13px] text-warning" role="status">Enter the square feet for every area.</p>}
          {formError && <p role="alert" className="text-[13px] text-danger">{formError}</p>}
          <Button type="button" onClick={save} disabled={!canSave || (!dirty && bid !== null)} className="h-11 w-full md:h-9" data-testid="bid-save">
            {bid ? "Save as a new version" : "Save bid"}
          </Button>
        </GlassPanel>

        {bid && (
          <GlassPanel as="section" aria-label="Status" className="space-y-3 p-5">
            <h2 className="font-heading text-base font-medium text-ink">Send</h2>
            {bid.status === "draft" && <Button type="button" variant="secondary" onClick={() => status("ready")} disabled={pending || dirty} className="h-11 w-full md:h-9" data-testid="bid-ready">Mark ready to send</Button>}
            {bid.status === "ready" && (
              <>
                <div className="space-y-1.5"><Label htmlFor="bid-valid">Valid until</Label><Input id="bid-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-11 md:h-9" /></div>
                <Button type="button" onClick={() => status("sent")} disabled={pending || validUntil < nyToday()} className="h-11 w-full md:h-9" data-testid="bid-sent">Mark as sent</Button>
                <Button type="button" variant="ghost" onClick={() => status("draft")} disabled={pending} className="h-11 w-full md:h-9">Back to draft</Button>
              </>
            )}
            {bid.status === "sent" && <p className="text-sm text-ink-muted">Sent{bid.validUntil ? `, valid until ${formatCalendarDate(bid.validUntil)}` : ""}. Edit to make a new revision.</p>}
            {dirty && bid.status === "draft" && <p className="text-[12px] text-ink-muted">Save your changes before marking it ready.</p>}
            <Button render={<Link href={`/bids/${bid.id}/print`} target="_blank" />} variant="secondary" className="h-11 w-full md:h-9"><Printer aria-hidden /> Printable bid</Button>
          </GlassPanel>
        )}

        {bid && <BidProjectPanel bid={bid} />}

        {bid && bid.versions.length > 0 && (
          <GlassPanel as="section" aria-label="Versions" className="space-y-2 p-5" data-testid="bid-versions">
            <h2 className="font-heading text-base font-medium text-ink">Versions</h2>
            <ul className="space-y-2 text-[13px]">
              {bid.versions.map((v) => (
                <li key={v.version} className="flex items-start justify-between gap-3 border-t border-hairline pt-2 first:border-t-0 first:pt-0">
                  <span>
                    <span className="block font-medium text-ink">Version {v.version}{v.version === bid.currentVersion ? " (current)" : ""}</span>
                    <span className="block text-ink-muted">{formatNyDateTime(v.createdAt)}</span>
                    {v.floorOverrideReason && <span className="block text-ink-muted">Below floor: {v.floorOverrideReason}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block text-ink tabular">{formatCents(v.priceCents, { hideZeroCents: true })}</span>
                    <span className="block text-ink-muted tabular">{pct(v.marginBps)}</span>
                    {v.version !== bid.currentVersion && !closed && (
                      <button type="button" onClick={() => setDraft(draftFrom(v.inputs, bid.title, rules, ""))} className="text-brand-text underline outline-none focus-visible:ring-2 focus-visible:ring-ring">Load</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </GlassPanel>
        )}
      </aside>
    </div>
  );
}
