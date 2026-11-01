"use client";

import { useState } from "react";
import { saveGhlSettings } from "@/app/actions/ghl";
import { ghlSettingsSchema } from "@/lib/schemas/ghl";
import type { GhlPageData } from "@/lib/ghl/status-data";
import { stageLabel } from "@/lib/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassPanel } from "@/components/system/glass-panel";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";

const STAGES = ["new", "contacted", "quoted", "won", "lost"] as const;

/** The pipeline mapping, whether stage changes are sent to GHL, and the text limits. */
export function GhlSettingsForm({ settings }: { settings: GhlPageData["settings"] }) {
  const { run, pending } = useFinanceAction();
  const [pipelineId, setPipelineId] = useState(settings.pipelineId);
  const [stageIds, setStageIds] = useState<Record<(typeof STAGES)[number], string>>({
    new: settings.stageIds.new ?? "", contacted: settings.stageIds.contacted ?? "", quoted: settings.stageIds.quoted ?? "",
    won: settings.stageIds.won ?? "", lost: settings.stageIds.lost ?? "",
  });
  const [syncMode, setSyncMode] = useState(settings.opportunitySyncMode);
  const [business, setBusiness] = useState(settings.businessName);
  const [perContact, setPerContact] = useState(String(settings.maxPerContactPerDay));
  const [perHour, setPerHour] = useState(String(settings.maxPerHour));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { pipelineId, stageIds, opportunitySyncMode: syncMode, businessName: business, maxPerContactPerDay: Number(perContact), maxPerHour: Number(perHour) };
    const parsed = ghlSettingsSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => saveGhlSettings(input), "GHL settings saved");
  }

  return (
    <GlassPanel as="section" aria-labelledby="ghl-settings" className="kc-enter p-5" data-testid="ghl-settings">
      <form onSubmit={submit} className="space-y-5" noValidate aria-label="GoHighLevel settings">
        <h2 id="ghl-settings" className="font-heading text-lg font-medium text-ink">Pipeline and limits</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ghl-biz">Business name in texts</Label>
            <Input id="ghl-biz" value={business} onChange={(e) => setBusiness(e.target.value)} aria-invalid={Boolean(errors.businessName)} className="h-11 md:h-9" />
            {errors.businessName && <p role="alert" className="text-[12px] text-danger">{errors.businessName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ghl-pipe">Pipeline id</Label>
            <Input id="ghl-pipe" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-11 md:h-9" placeholder="From the GHL pipeline settings" />
          </div>
          {STAGES.map((s) => (
            <div key={s} className="space-y-1.5">
              <Label htmlFor={`ghl-stage-${s}`}>{stageLabel[s]} stage id</Label>
              <Input id={`ghl-stage-${s}`} value={stageIds[s]} onChange={(e) => setStageIds({ ...stageIds, [s]: e.target.value })} className="h-11 md:h-9" />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="ghl-per-contact">Texts per customer per day (most)</Label>
            <Input id="ghl-per-contact" inputMode="numeric" value={perContact} onChange={(e) => setPerContact(e.target.value)} aria-invalid={Boolean(errors.maxPerContactPerDay)} className="h-11 md:h-9" />
            {errors.maxPerContactPerDay && <p role="alert" className="text-[12px] text-danger">{errors.maxPerContactPerDay}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ghl-per-hour">Texts per hour, all customers (most)</Label>
            <Input id="ghl-per-hour" inputMode="numeric" value={perHour} onChange={(e) => setPerHour(e.target.value)} aria-invalid={Boolean(errors.maxPerHour)} className="h-11 md:h-9" />
            {errors.maxPerHour && <p role="alert" className="text-[12px] text-danger">{errors.maxPerHour}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink" id="ghl-sync-label">Send stage changes to GHL</p>
          <div role="radiogroup" aria-labelledby="ghl-sync-label" className="flex gap-2">
            {(["dry_run", "live"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={syncMode === m} onClick={() => setSyncMode(m)} className={`h-11 rounded-sm border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 ${syncMode === m ? "border-brand bg-highlight text-ink" : "border-hairline text-ink-muted"}`}>
                {m === "dry_run" ? "Dry run" : "Live"}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-ink-muted">Dry run notes what it would change in GHL and changes nothing there.</p>
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={pending} className="h-11 md:h-9" data-testid="save-ghl-settings">Save settings</Button></div>
      </form>
    </GlassPanel>
  );
}
