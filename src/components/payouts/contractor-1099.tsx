"use client";

import { useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Eye, FileCheck2, FileUp, FileX2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeW9, uploadW9, w9ViewUrl } from "@/app/actions/payouts";
import { formatCents } from "@/lib/format";
import { classify1099, remainingToThresholdCents, totals1099, type Threshold1099 } from "@/lib/payouts";
import type { Contractor1099 } from "@/lib/finance-data";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import type { Tone } from "@/lib/status";

const tone: Record<Threshold1099, Tone> = { ok: "neutral", approaching: "warning", over: "danger" };
const label: Record<Threshold1099, string> = { ok: "Under threshold", approaching: "Approaching", over: "Over threshold" };

function W9Cell({ row }: { row: Contractor1099 }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.set("subcontractorId", row.subcontractorId);
    fd.set("file", file);
    start(async () => {
      const r = await uploadW9(fd);
      if (r.ok) {
        toast.success(`W-9 saved for ${row.displayName}`);
        router.refresh();
      } else toast.error(r.message);
    });
  }
  function view() {
    if (!row.w9DocId) return;
    const id = row.w9DocId;
    start(async () => {
      const r = await w9ViewUrl({ id });
      if (r.ok) window.open(r.url, "_blank", "noopener,noreferrer");
      else toast.error(r.message);
    });
  }
  function remove() {
    if (!row.w9DocId || !window.confirm(`Remove ${row.displayName}'s W-9?`)) return;
    const id = row.w9DocId;
    start(async () => {
      const r = await removeW9({ id });
      if (r.ok) {
        toast.success("W-9 removed");
        router.refresh();
      } else toast.error(r.message);
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {row.w9OnFile ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-success"><FileCheck2 className="size-4" aria-hidden /> On file</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-warning"><FileX2 className="size-4" aria-hidden /> Missing</span>
      )}
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label={`W-9 file for ${row.displayName}`} onChange={onFile} data-testid="w9-input" />
      <Button type="button" variant="secondary" size="sm" className="h-8" disabled={pending} onClick={() => input.current?.click()}>
        <FileUp aria-hidden /> {row.w9OnFile ? "Replace" : "Upload"}
      </Button>
      {row.w9DocId && (
        <>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`View ${row.displayName}'s W-9`} disabled={pending} onClick={view}><Eye /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${row.displayName}'s W-9`} disabled={pending} onClick={remove}><Trash2 /></Button>
        </>
      )}
    </div>
  );
}

/** Year-to-date paid totals per subcontractor, the 1099 flag, W-9 status and the accountant's CSV. */
export function Contractors1099({ rows, year, thresholdCents, warnBps }: { rows: Contractor1099[]; year: number; thresholdCents: number; warnBps: number }) {
  const totals = totals1099(rows, thresholdCents, warnBps);
  return (
    <GlassPanel as="section" aria-labelledby="t1099" className="space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="t1099" className="font-heading text-lg font-medium text-ink">1099 tracking</h2>
          <p className="text-[13px] text-ink-muted">
            Paid in {year} by the date you marked each payout paid (New York). Flag threshold {formatCents(thresholdCents, { hideZeroCents: true })}: confirm the current IRS figure with your accountant and change it in <Link href="/settings" className="text-brand-text underline underline-offset-2">Settings</Link>.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="icon" aria-label="Previous year" className="size-9" render={<Link href={`/payouts?year=${year - 1}`} />}><ChevronLeft /></Button>
          <span className="min-w-12 text-center text-sm font-medium text-ink tabular">{year}</span>
          <Button variant="secondary" size="icon" aria-label="Next year" className="size-9" render={<Link href={`/payouts?year=${year + 1}`} />}><ChevronRight /></Button>
          <Button variant="secondary" size="sm" className="ml-1 h-9" render={<a href={`/payouts/1099?year=${year}`} download />} data-testid="export-1099">
            <Download aria-hidden /> CSV for accountant
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><dt className="text-[12px] text-ink-muted">Paid in {year}</dt><dd className="font-heading text-xl font-medium text-ink tabular"><AnimatedNumber value={totals.paidCents} kind="cents" hideZeroCents /></dd></div>
        <div><dt className="text-[12px] text-ink-muted">Over threshold</dt><dd className="font-heading text-xl font-medium text-ink tabular">{totals.over}</dd></div>
        <div><dt className="text-[12px] text-ink-muted">Approaching</dt><dd className="font-heading text-xl font-medium text-ink tabular">{totals.approaching}</dd></div>
        <div><dt className="text-[12px] text-ink-muted">Missing a W-9</dt><dd className="font-heading text-xl font-medium text-ink tabular">{totals.missingW9}</dd></div>
      </dl>

      <ul className="divide-y divide-hairline" data-testid="contractors">
        {rows.map((r) => {
          const c = classify1099(r.paidCents, thresholdCents, warnBps);
          const pct = thresholdCents > 0 ? Math.min(100, Math.round((r.paidCents / thresholdCents) * 100)) : 0;
          return (
            <li key={r.subcontractorId} className="grid gap-3 py-4 md:grid-cols-12 md:items-center" data-testid="contractor-row">
              <div className="min-w-0 md:col-span-3">
                <p className="truncate font-medium text-ink">{r.displayName}</p>
                <p className="truncate text-[12px] text-ink-muted capitalize">{r.legalName ? `${r.legalName} · ` : ""}{r.businessEntity}</p>
              </div>
              <div className="md:col-span-4">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink tabular" data-testid="paid-ytd">{formatCents(r.paidCents)}</span>
                  <span className="text-[12px] text-ink-muted tabular">{c === "over" ? "over by" : "to threshold"} {formatCents(c === "over" ? r.paidCents - thresholdCents : remainingToThresholdCents(r.paidCents, thresholdCents), { hideZeroCents: true })}</span>
                </div>
                <div role="progressbar" aria-label={`${r.displayName} toward the 1099 threshold`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--kc-surface-raised)_55%,transparent)] ring-1 ring-hairline">
                  <div className={c === "over" ? "h-full rounded-full bg-danger-fill" : c === "approaching" ? "h-full rounded-full bg-warning-fill" : "h-full rounded-full bg-brand"} style={{ width: `${pct}%` }} />
                </div>
                {r.approvedCents > 0 && <p className="mt-1 text-[12px] text-ink-muted tabular">+ {formatCents(r.approvedCents)} approved, not yet paid</p>}
              </div>
              <div className="md:col-span-2"><StatusPill tone={tone[c]}>{label[c]}</StatusPill></div>
              <div className="md:col-span-3"><W9Cell row={r} /></div>
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
