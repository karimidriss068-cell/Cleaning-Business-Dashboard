"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createAdCampaign, deleteAdSpend, recordAdSpend } from "@/app/actions/growth";
import { formatCalendarDate, formatCents, parseDollarsToCents } from "@/lib/format";
import { AD_PLATFORMS, CHANNELS, adSpendSchema, campaignSchema, channelLabel, platformLabel } from "@/lib/schemas/growth";
import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";

const cents = (c: number | null) => (c === null ? "—" : formatCents(c, { hideZeroCents: true }));
const channelItems = CHANNELS.map((c) => ({ value: c, label: channelLabel[c] }));
const platformItems = AD_PLATFORMS.map((p) => ({ value: p, label: platformLabel[p] }));
const platformName = (p: string) => (p in platformLabel ? platformLabel[p as keyof typeof platformLabel] : p);

/**
 * Manual ad spend: one figure per campaign per day (entering a day again
 * replaces it). Nothing here calls an ad platform. Leads reach a campaign
 * through their source (Instagram/Meta, Google, Thumbtack); cost per lead and
 * per booked client are worked out from this spend and those leads.
 */
export function AdSpendPanel({ ads, today, canEdit }: { ads: GrowthSnapshot["ads"]; today: string; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const campaigns = ads.campaigns;
  const [campaignId, setCampaignId] = useState<string>(campaigns.find((c) => c.status === "active")?.id ?? campaigns[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [spend, setSpend] = useState("");
  const [creative, setCreative] = useState("");
  const [channel, setChannel] = useState<string>("meta");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [platform, setPlatform] = useState<string>("meta");
  const [name, setName] = useState("");
  const [campErrors, setCampErrors] = useState<Record<string, string>>({});

  const campaignItems = campaigns.map((c) => ({ value: c.id, label: `${c.name} (${platformName(c.platform)})` }));

  function addSpend(e: React.FormEvent) {
    e.preventDefault();
    const spendCents = parseDollarsToCents(spend);
    if (spendCents === null) return setErrors({ spendCents: "Enter dollars, like 42.50" });
    const input = { campaignId, date, spendCents, creative: creative.trim() === "" ? undefined : creative };
    const parsed = adSpendSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => recordAdSpend(input), "Ad spend saved", () => setSpend(""));
  }

  function addCampaign(e: React.FormEvent) {
    e.preventDefault();
    const input = { platform, name, channel };
    const parsed = campaignSchema.safeParse(input);
    if (!parsed.success) return setCampErrors(fieldErrors(parsed.error));
    setCampErrors({});
    run(() => createAdCampaign(input), "Campaign added", (r) => {
      setName("");
      setCampaignId(r.id);
    });
  }

  return (
    <div className="space-y-6">
      <GlassPanel as="div" className="overflow-hidden">
        <div className="border-b border-hairline px-5 py-4">
          <h3 className="font-heading text-base font-medium text-ink">Campaigns, last 30 days</h3>
          <p className="text-[13px] text-ink-muted">Spend you entered, and the leads whose source points at the campaign.</p>
        </div>
        {campaigns.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-muted">No campaigns yet. Add one below, then enter its daily spend.</p>
        ) : (
          <Table stackOnMobile data-testid="campaign-table">
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Cost per lead</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Cost per booked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell label="Campaign">
                    <div className="min-w-0 max-md:text-right">
                      <div className="flex flex-wrap items-center gap-2 max-md:justify-end">
                        <span className="font-medium text-ink">{c.name}</span>
                        {c.isDemo && <StatusPill tone="warning">Demo</StatusPill>}
                      </div>
                      <div className="text-[12px] text-ink-muted">{platformName(c.platform)} · {channelLabel[c.channel as keyof typeof channelLabel] ?? c.channel}{c.status !== "active" ? ` · ${c.status}` : ""}</div>
                    </div>
                  </TableCell>
                  <TableCell label="Spend" className="text-right tabular">{cents(c.spend30Cents)}</TableCell>
                  <TableCell label="Leads" className="text-right tabular">{c.leads30}</TableCell>
                  <TableCell label="Cost per lead" className="text-right tabular">{cents(c.leads30 > 0 ? Math.round(c.spend30Cents / c.leads30) : null)}</TableCell>
                  <TableCell label="Booked" className="text-right tabular">{c.booked30}</TableCell>
                  <TableCell label="Cost per booked" className="text-right tabular">{cents(c.booked30 > 0 ? Math.round(c.spend30Cents / c.booked30) : null)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GlassPanel>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel as="div" className="min-w-0 p-5">
          <h3 className="font-heading text-base font-medium text-ink">Enter ad spend</h3>
          <p className="mb-4 text-[13px] text-ink-muted">One amount per campaign per day. Entering a day again replaces it.</p>
          {canEdit ? (
            <form onSubmit={addSpend} className="space-y-4" noValidate aria-label="Enter ad spend">
              <div className="space-y-1.5">
                <Label>Campaign</Label>
                <Select items={campaignItems} value={campaignId} onValueChange={(v) => v && setCampaignId(v)}>
                  <SelectTrigger className="h-11 w-full min-w-0 md:h-9" aria-label="Campaign"><SelectValue className="min-w-0 truncate" placeholder="Add a campaign first" /></SelectTrigger>
                  <SelectContent>{campaignItems.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {errors.campaignId && <p role="alert" className="text-[12px] text-danger">Pick a campaign</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="spend-date">Date</Label>
                  <Input id="spend-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-11 md:h-9" />
                  {errors.date && <p role="alert" className="text-[12px] text-danger">{errors.date}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="spend-amount">Spend ($)</Label>
                  <Input id="spend-amount" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} aria-invalid={Boolean(errors.spendCents)} className="h-11 md:h-9" placeholder="42.50" />
                  {errors.spendCents && <p role="alert" className="text-[12px] text-danger">{errors.spendCents}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spend-creative">Creative (optional)</Label>
                <Input id="spend-creative" value={creative} onChange={(e) => setCreative(e.target.value)} className="h-11 md:h-9" placeholder="Before and after reel" />
                <p className="text-[12px] text-ink-muted">Use the same name on the lead so the funnel can tell creatives apart.</p>
              </div>
              <Button type="submit" disabled={pending || campaignId === ""} className="h-11 sm:h-9" data-testid="add-ad-spend">{pending ? "Saving…" : "Add spend"}</Button>
            </form>
          ) : (
            <p className="text-[13px] text-ink-muted">Only the owner or an admin can enter ad spend.</p>
          )}
        </GlassPanel>

        <GlassPanel as="div" className="min-w-0 p-5">
          <h3 className="font-heading text-base font-medium text-ink">Add a campaign</h3>
          <p className="mb-4 text-[13px] text-ink-muted">Name it as it appears in the ad platform. Leads from its source are attached automatically.</p>
          {canEdit ? (
            <form onSubmit={addCampaign} className="space-y-4" noValidate aria-label="Add a campaign">
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Select items={platformItems} value={platform} onValueChange={(v) => { if (!v) return; setPlatform(v); setChannel(v === "meta" ? "meta" : v === "google" ? "google_search" : "other"); }}>
                  <SelectTrigger className="h-11 w-full md:h-9" aria-label="Platform"><SelectValue /></SelectTrigger>
                  <SelectContent>{platformItems.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select items={channelItems} value={channel} onValueChange={(v) => v && setChannel(v)}>
                  <SelectTrigger className="h-11 w-full min-w-0 md:h-9" aria-label="Channel"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
                  <SelectContent>{channelItems.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-name">Campaign name</Label>
                <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(campErrors.name)} className="h-11 md:h-9" />
                {campErrors.name && <p role="alert" className="text-[12px] text-danger">{campErrors.name}</p>}
              </div>
              <Button type="submit" variant="secondary" disabled={pending} className="h-11 sm:h-9" data-testid="add-campaign">Add campaign</Button>
            </form>
          ) : (
            <p className="text-[13px] text-ink-muted">Only the owner or an admin can add campaigns.</p>
          )}
        </GlassPanel>
      </div>

      <GlassPanel as="div" className="overflow-hidden">
        <div className="border-b border-hairline px-5 py-4">
          <h3 className="font-heading text-base font-medium text-ink">Recent entries</h3>
        </div>
        {ads.recentSpend.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">Nothing entered yet.</p>
        ) : (
          <ul className="divide-y divide-hairline" data-testid="recent-spend">
            {ads.recentSpend.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{formatCalendarDate(r.date)}</span>
                  <span className="text-ink-muted"> · {r.campaign}{r.creative ? ` · ${r.creative}` : ""}</span>
                  {r.isDemo && <span className="ml-2 align-middle"><StatusPill tone="warning">Demo</StatusPill></span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ink tabular">{cents(r.spendCents)}</span>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 md:size-8"
                      aria-label={`Delete ${r.campaign} spend on ${formatCalendarDate(r.date)}`}
                      disabled={pending}
                      onClick={() => run(() => deleteAdSpend({ id: r.id }), "Entry deleted")}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}
