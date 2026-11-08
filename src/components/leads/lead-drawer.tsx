"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ArrowRightLeft, ArrowRightLeft as ChangeIcon, Mail, MessageSquare, Phone, StickyNote, UserCheck } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { BOROUGHS, SOURCES, boroughLabel, formatPhone, sourceLabel, stageLabel } from "@/lib/leads";
import { DEFAULT_WIN_BPS } from "@/lib/pipeline";
import { formatCents, formatNyDateTime, nyWallClock, nyWallTimeToUtc, parseDollarsToCents } from "@/lib/format";
import { bidLabel, leadTone, type BidStatusKey } from "@/lib/status";
import type { LeadRow, TeamMember, TimelineEntry } from "@/lib/leads-data";
import { addLeadNote, getLeadTimeline, updateLead } from "@/app/actions/leads";
import { setLeadAttribution } from "@/app/actions/growth";
import { setSmsConsent } from "@/app/actions/ghl";
import { CHANNELS, channelLabel } from "@/lib/schemas/growth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Drawer } from "@/components/system/drawer";
import { StatusPill } from "@/components/system/status-pill";
import { BidDuePill, FollowUpPill } from "./lead-card";

const typeIcon = { call: Phone, sms: MessageSquare, email: Mail, note: StickyNote, meeting: UserCheck, status_change: ChangeIcon } as const;

type Props = {
  lead: LeadRow | null;
  /** Owners and admins build bids; everyone else just sees whether one exists. */
  canBid: boolean;
  team: TeamMember[];
  today: string;
  onClose: () => void;
  onMove: (lead: LeadRow) => void;
  /** Applies a server-confirmed change to the lead in the board. */
  onChanged: (id: string, patch: Partial<LeadRow>) => void;
};

/** The lead record: details you can edit, the activity timeline, and Convert to customer. */
export function LeadDrawer(props: Props) {
  const { lead, onClose } = props;
  return (
    <Drawer open={lead !== null} onOpenChange={(o) => !o && onClose()} title={lead?.accountName ?? lead?.name ?? "Opportunity"} description={lead ? `${lead.source ? (sourceLabel[lead.source as keyof typeof sourceLabel] ?? lead.source) : "no source"}` : undefined}>
      {lead && <LeadBody key={lead.id} {...props} lead={lead} />}
    </Drawer>
  );
}

function LeadBody({ lead, team, today, canBid, onMove, onChanged }: Props & { lead: LeadRow }) {
  const [pending, start] = useTransition();
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({
    firstName: lead.firstName,
    lastName: lead.lastName ?? "",
    phone: lead.phone ? formatPhone(lead.phone) : "",
    email: lead.email ?? "",
    addressLine1: lead.addressLine1 ?? "",
    borough: lead.borough ?? "none",
    zip: lead.zip ?? "",
    valueDollars: lead.expectedValueCents === null ? "" : String(lead.expectedValueCents / 100),
    bidDueOn: lead.bidDueOn ?? "",
    siteVisitDate: lead.siteVisitAt ? nyWallClock(lead.siteVisitAt).date : "",
    siteVisitTime: lead.siteVisitAt ? nyWallClock(lead.siteVisitAt).time : "",
    winPct: lead.winProbabilityBps === null ? "" : String(lead.winProbabilityBps / 100),
    source: lead.source ?? "other",
    ownerId: lead.ownerId ?? "none",
    nextFollowUpOn: lead.nextFollowUpOn ?? "",
    notes: lead.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"note" | "call" | "sms">("call");
  const [noteText, setNoteText] = useState("");
  const [channel, setChannel] = useState<string>(lead.channel);
  const [creative, setCreative] = useState(lead.creative ?? "");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function changeConsent(consent: boolean) {
    start(async () => {
      const r = await setSmsConsent({ contactId: lead.contactId, consent, source: "staff" });
      if (!r.ok) return void toast.error(r.message);
      toast.success(consent ? "Text consent recorded" : "Text consent removed");
      onChanged(lead.id, { smsConsent: consent });
      reload();
    });
  }

  function saveAttribution(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await setLeadAttribution({ leadId: lead.id, channel, creative: creative.trim() === "" ? undefined : creative });
      if (!r.ok) return void toast.error(r.message);
      toast.success("Attribution saved");
      onChanged(lead.id, { channel, creative: creative.trim() === "" ? null : creative.trim(), updatedAt: r.updatedAt });
      reload();
    });
  }

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    void getLeadTimeline(lead.id).then((t) => live && setTimeline(t));
    return () => {
      live = false;
    };
  }, [lead.id, lead.updatedAt, version]);

  const channelItems = CHANNELS.map((c) => ({ value: c, label: channelLabel[c] }));
  const sourceItems = SOURCES.map((s) => ({ value: s, label: sourceLabel[s] }));
  const boroughItems = [{ value: "none", label: "Not set" }, ...BOROUGHS.map((b) => ({ value: b, label: boroughLabel(b) }))];
  const ownerItems = [{ value: "none", label: "Nobody" }, ...team.map((t) => ({ value: t.id, label: t.name }))];

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const valueCents = form.valueDollars.trim() === "" ? null : parseDollarsToCents(form.valueDollars);
    if (form.valueDollars.trim() !== "" && (valueCents === null || valueCents < 0)) return setError("Enter the project value in dollars, for example 7500.");
    const winPct = form.winPct.trim() === "" ? null : Number(form.winPct);
    if (winPct !== null && (!Number.isFinite(winPct) || winPct < 0 || winPct > 100)) return setError("Chance of winning is a percentage from 0 to 100.");
    if (form.siteVisitDate && !/^\d{2}:\d{2}$/.test(form.siteVisitTime || "09:00")) return setError("Enter the site visit time as hours and minutes.");
    const siteVisitAt = form.siteVisitDate ? nyWallTimeToUtc(form.siteVisitDate, form.siteVisitTime || "09:00").toISOString() : null;
    const winBps = winPct === null ? null : Math.round(winPct * 100);
    start(async () => {
      const res = await updateLead({
        leadId: lead.id,
        expectedUpdatedAt: lead.updatedAt,
        patch: {
          first_name: form.firstName,
          last_name: form.lastName.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address_line1: form.addressLine1.trim() || null,
          borough: form.borough === "none" ? null : form.borough,
          zip: form.zip.trim() || null,
          source: form.source,
          owner_id: form.ownerId === "none" ? null : form.ownerId,
          next_follow_up_on: form.nextFollowUpOn || null,
          notes: form.notes.trim() || null,
          expected_value_cents: valueCents,
          bid_due_on: form.bidDueOn || null,
          site_visit_at: siteVisitAt,
          win_probability_bps: winBps,
        },
      });
      if (!res.ok) {
        setError(res.message);
        if (res.code === "stale") toast.error("Lead changed by someone else", { description: "Close and reopen it to see the latest." });
        return;
      }
      const owner = team.find((t) => t.id === form.ownerId);
      onChanged(lead.id, {
        updatedAt: res.updatedAt,
        firstName: form.firstName,
        lastName: form.lastName.trim() || null,
        name: `${form.firstName} ${form.lastName}`.trim(),
        phone: form.phone.trim() ? (form.phone.replace(/\D/g, "").replace(/^1?(\d{10})$/, "+1$1")) : null,
        email: form.email.trim().toLowerCase() || null,
        addressLine1: form.addressLine1.trim() || null,
        borough: form.borough === "none" ? null : form.borough,
        zip: form.zip.trim() || null,
        source: form.source,
        expectedValueCents: valueCents,
        bidDueOn: form.bidDueOn || null,
        siteVisitAt,
        winProbabilityBps: winBps,
        ownerId: owner?.id ?? null,
        ownerName: owner?.name ?? null,
        nextFollowUpOn: form.nextFollowUpOn || null,
        notes: form.notes.trim() || null,
      });
      toast.success("Saved");
    });
  }

  function logNote(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await addLeadNote({ leadId: lead.id, kind, body: noteText });
      if (!res.ok) return void toast.error(res.message);
      setNoteText("");
      reload();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={leadTone(lead.stage)}>{stageLabel[lead.stage]}</StatusPill>
        <BidDuePill lead={lead} today={today} />
        <FollowUpPill lead={lead} today={today} />
        {lead.stage === "lost" && lead.lostReason && <span className="text-[13px] text-ink-muted">Reason: {lead.lostReason}</span>}
        <Button type="button" variant="secondary" size="sm" onClick={() => onMove(lead)} className="ml-auto h-11 md:h-8">
          <ArrowRightLeft aria-hidden /> Move…
        </Button>
      </div>

      <section aria-label="Bid" className="rounded-md border border-hairline bg-surface-raised/50 p-3 text-sm" data-testid="lead-bid">
        {lead.bid ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink">
              <strong className="font-semibold">Bid {lead.bid.number}</strong> <span className="text-ink-muted">({bidLabel[lead.bid.status as BidStatusKey] ?? lead.bid.status}{lead.bid.priceCents !== null ? `, ${formatCents(lead.bid.priceCents, { hideZeroCents: true })}` : ""})</span>
            </p>
            {canBid && <Button render={<Link href={lead.bid.projectId ? `/projects/${lead.bid.projectId}` : `/bids/${lead.bid.id}`} />} className="h-11 md:h-9">{lead.bid.projectId ? "Open project" : "Open bid"}</Button>}
          </div>
        ) : lead.stage === "lost" ? (
          <p className="text-ink-muted">Reopen this opportunity before bidding on it.</p>
        ) : canBid ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink-muted">Price the scope and build the bid.</p>
            <Button render={<Link href={`/bids/new?lead=${lead.id}`} />} className="h-11 md:h-9">Build bid</Button>
          </div>
        ) : (
          <p className="text-ink-muted">No bid yet. The owner or an admin builds bids.</p>
        )}
      </section>

      <form onSubmit={save} className="space-y-4" aria-label="Lead details" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field id="ld-first" label="First name"><Input id="ld-first" value={form.firstName} onChange={set("firstName")} className="h-11 md:h-9" /></Field>
          <Field id="ld-last" label="Last name"><Input id="ld-last" value={form.lastName} onChange={set("lastName")} className="h-11 md:h-9" /></Field>
        </div>
        <Field id="ld-phone" label="Phone"><Input id="ld-phone" type="tel" value={form.phone} onChange={set("phone")} className="h-11 md:h-9" /></Field>
        <Field id="ld-email" label="Email"><Input id="ld-email" type="email" value={form.email} onChange={set("email")} className="h-11 md:h-9" /></Field>
        <Field id="ld-addr" label="Address"><Input id="ld-addr" value={form.addressLine1} onChange={set("addressLine1")} className="h-11 md:h-9" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <PickField label="Borough" items={boroughItems} value={form.borough} onChange={(v) => setForm((f) => ({ ...f, borough: v }))} />
          <Field id="ld-zip" label="ZIP"><Input id="ld-zip" inputMode="numeric" value={form.zip} onChange={set("zip")} className="h-11 md:h-9" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PickField label="Source" items={sourceItems} value={form.source} onChange={(v) => setForm((f) => ({ ...f, source: v }))} />
        </div>
        <fieldset className="space-y-3 rounded-md border border-hairline p-3" aria-label="Bid details">
          <legend className="px-1 text-[13px] font-medium text-ink">Bid</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ld-value" label="Project value ($)"><Input id="ld-value" inputMode="decimal" placeholder="7500" value={form.valueDollars} onChange={set("valueDollars")} className="h-11 md:h-9" /></Field>
            <Field id="ld-bid-due" label="Bid due"><Input id="ld-bid-due" type="date" value={form.bidDueOn} onChange={set("bidDueOn")} className="h-11 md:h-9" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ld-visit-date" label="Site visit"><Input id="ld-visit-date" type="date" value={form.siteVisitDate} onChange={set("siteVisitDate")} className="h-11 md:h-9" /></Field>
            <Field id="ld-visit-time" label="Visit time"><Input id="ld-visit-time" type="time" value={form.siteVisitTime} onChange={set("siteVisitTime")} className="h-11 md:h-9" /></Field>
          </div>
          <Field id="ld-win" label="Chance of winning (%)">
            <Input id="ld-win" inputMode="decimal" placeholder={`${DEFAULT_WIN_BPS[lead.stage] / 100} (stage estimate)`} value={form.winPct} onChange={set("winPct")} className="h-11 md:h-9" />
          </Field>
          <p className="text-[12px] text-ink-muted">Stage estimates are placeholders until enough bids have closed. Your own number overrides them.</p>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <PickField label="Owner" items={ownerItems} value={form.ownerId} onChange={(v) => setForm((f) => ({ ...f, ownerId: v }))} />
          <Field id="ld-follow" label="Next follow-up"><Input id="ld-follow" type="date" value={form.nextFollowUpOn} onChange={set("nextFollowUpOn")} className="h-11 md:h-9" /></Field>
        </div>
        <Field id="ld-notes" label="Notes"><Textarea id="ld-notes" value={form.notes} onChange={set("notes")} /></Field>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || form.firstName.trim() === ""} className="h-11 md:h-9">Save changes</Button>
        </div>
      </form>

      <form onSubmit={saveAttribution} className="space-y-3 border-t border-hairline pt-4" aria-label="Ad attribution" noValidate>
        <h3 className="font-heading text-lg font-medium text-ink">Where it came from</h3>
        <div className="grid grid-cols-2 gap-3">
          <PickField label="Channel" items={channelItems} value={channel} onChange={setChannel} />
          <Field id="ld-creative" label="Creative"><Input id="ld-creative" value={creative} onChange={(e) => setCreative(e.target.value)} className="h-11 md:h-9" placeholder="Ad or video name" /></Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending} className="h-11 md:h-9" data-testid="save-attribution">Save attribution</Button>
        </div>
      </form>

      <section aria-label="Text messages" className="space-y-2 border-t border-hairline pt-4" data-testid="sms-consent">
        <h3 className="font-heading text-lg font-medium text-ink">Text messages</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <StatusPill tone={lead.smsOptedOut ? "danger" : lead.smsConsent ? "success" : "neutral"}>
              {lead.smsOptedOut ? "Replied STOP" : lead.smsConsent ? "Agreed to texts" : "No consent on file"}
            </StatusPill>
            <p className="text-[12px] text-ink-muted">Automated texts (replies, reminders, review and payment links) only go to customers who agreed to them.</p>
          </div>
          {!lead.smsOptedOut && (
            <Button type="button" variant="secondary" disabled={pending || !lead.phone} className="h-11 md:h-9" onClick={() => changeConsent(!lead.smsConsent)} data-testid="toggle-sms-consent">
              {lead.smsConsent ? "Remove consent" : "Record consent"}
            </Button>
          )}
        </div>
      </section>

      <section aria-label="Activity" className="space-y-3 border-t border-hairline pt-4">
        <h3 className="font-heading text-lg font-medium text-ink">Activity</h3>
        <form onSubmit={logNote} className="space-y-2">
          <div role="radiogroup" aria-label="Type of entry" className="flex gap-2">
            {(["call", "sms", "note"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`h-11 flex-1 rounded-sm border text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8 ${kind === k ? "border-brand bg-highlight text-ink" : "border-hairline text-ink-muted"}`}>
                {{ call: "Call note", sms: "Message", note: "Note" }[k]}
              </button>
            ))}
          </div>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} aria-label="Activity text" placeholder={kind === "call" ? "What was said on the call" : kind === "sms" ? "What you texted or what they replied" : "Anything worth remembering"} />
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" disabled={pending || noteText.trim() === ""} className="h-11 md:h-9">Log it</Button>
          </div>
        </form>
        {timeline === null ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          <ol className="space-y-3" data-testid="timeline">
            {timeline.map((t) => {
              const Icon = typeIcon[t.type as keyof typeof typeIcon] ?? StickyNote;
              return (
                <li key={t.id} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted"><Icon className="size-3.5" aria-hidden /></span>
                  <div className="min-w-0 text-sm">
                    <p className="text-ink">{t.subject}</p>
                    {t.body && <p className="whitespace-pre-wrap text-ink-muted">{t.body}</p>}
                    <p className="text-[12px] text-ink-muted tabular">{formatNyDateTime(t.at)}{t.actor ? ` · ${t.actor}` : ""}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function PickField({ label, items, value, onChange }: { label: string; items: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-11 w-full md:h-9" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
