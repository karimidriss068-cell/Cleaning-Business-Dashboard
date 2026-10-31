"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ArrowRightLeft, ArrowRightLeft as ChangeIcon, Mail, MessageSquare, Phone, StickyNote, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { BOROUGHS, SERVICE_TYPES, SOURCES, boroughLabel, formatPhone, serviceTypeLabel, sourceLabel, stageLabel } from "@/lib/leads";
import { formatNyDateTime } from "@/lib/format";
import { leadTone } from "@/lib/status";
import type { LeadRow, TeamMember, TimelineEntry } from "@/lib/leads-data";
import { addLeadNote, convertLead, getLeadTimeline, updateLead } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Drawer } from "@/components/system/drawer";
import { StatusPill } from "@/components/system/status-pill";
import { FollowUpPill } from "./lead-card";

const typeIcon = { call: Phone, sms: MessageSquare, email: Mail, note: StickyNote, meeting: UserCheck, status_change: ChangeIcon } as const;

type Props = {
  lead: LeadRow | null;
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
    <Drawer open={lead !== null} onOpenChange={(o) => !o && onClose()} title={lead?.name ?? "Lead"} description={lead ? `${serviceTypeLabel[lead.serviceType]} · ${lead.source ? (sourceLabel[lead.source as keyof typeof sourceLabel] ?? lead.source) : "no source"}` : undefined}>
      {lead && <LeadBody key={lead.id} {...props} lead={lead} />}
    </Drawer>
  );
}

function LeadBody({ lead, team, today, onMove, onChanged }: Props & { lead: LeadRow }) {
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
    serviceType: lead.serviceType as string,
    source: lead.source ?? "other",
    ownerId: lead.ownerId ?? "none",
    nextFollowUpOn: lead.nextFollowUpOn ?? "",
    notes: lead.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"note" | "call" | "sms">("call");
  const [noteText, setNoteText] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    void getLeadTimeline(lead.id).then((t) => live && setTimeline(t));
    return () => {
      live = false;
    };
  }, [lead.id, lead.updatedAt, version]);

  const serviceItems = SERVICE_TYPES.map((s) => ({ value: s, label: serviceTypeLabel[s] }));
  const sourceItems = SOURCES.map((s) => ({ value: s, label: sourceLabel[s] }));
  const boroughItems = [{ value: "none", label: "Not set" }, ...BOROUGHS.map((b) => ({ value: b, label: boroughLabel(b) }))];
  const ownerItems = [{ value: "none", label: "Nobody" }, ...team.map((t) => ({ value: t.id, label: t.name }))];

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
          service_type: form.serviceType,
          source: form.source,
          owner_id: form.ownerId === "none" ? null : form.ownerId,
          next_follow_up_on: form.nextFollowUpOn || null,
          notes: form.notes.trim() || null,
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
        serviceType: form.serviceType as LeadRow["serviceType"],
        source: form.source,
        ownerId: owner?.id ?? null,
        ownerName: owner?.name ?? null,
        nextFollowUpOn: form.nextFollowUpOn || null,
        notes: form.notes.trim() || null,
      });
      toast.success("Lead saved");
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

  function convert() {
    start(async () => {
      const res = await convertLead({ leadId: lead.id, expectedUpdatedAt: lead.updatedAt, companyName: lead.serviceType === "commercial" ? form.firstName + (form.lastName ? ` ${form.lastName}` : "") : "" });
      if (!res.ok) return void toast.error(res.code === "stale" ? "Lead changed by someone else" : "Couldn't convert", { description: res.message });
      onChanged(lead.id, {
        quote: { id: res.quoteId, number: res.quoteNumber, status: "draft" },
        stage: res.stage as LeadRow["stage"],
        updatedAt: res.updatedAt,
      });
      toast.success(res.already ? `Quote #${res.quoteNumber} already open` : `Customer created, quote #${res.quoteNumber} opened`, { description: "Draft quote with the service as its first line." });
      reload();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={leadTone(lead.stage)}>{stageLabel[lead.stage]}</StatusPill>
        <FollowUpPill lead={lead} today={today} />
        {lead.stage === "lost" && lead.lostReason && <span className="text-[13px] text-ink-muted">Reason: {lead.lostReason}</span>}
        <Button type="button" variant="secondary" size="sm" onClick={() => onMove(lead)} className="ml-auto h-11 md:h-8">
          <ArrowRightLeft aria-hidden /> Move…
        </Button>
      </div>

      <section aria-label="Customer" className="rounded-md border border-hairline bg-surface-raised/50 p-3 text-sm">
        {lead.quote ? (
          <p className="text-ink">
            Customer, <strong className="font-semibold">quote #{lead.quote.number}</strong> <span className="text-ink-muted">({lead.quote.status})</span>
          </p>
        ) : lead.stage === "lost" ? (
          <p className="text-ink-muted">Reopen this lead before converting it.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink-muted">Turn this into a customer and start a quote.</p>
            <Button type="button" onClick={convert} disabled={pending} className="h-11 md:h-9">Convert to customer</Button>
          </div>
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
          <PickField label="Service" items={serviceItems} value={form.serviceType} onChange={(v) => setForm((f) => ({ ...f, serviceType: v }))} />
          <PickField label="Source" items={sourceItems} value={form.source} onChange={(v) => setForm((f) => ({ ...f, source: v }))} />
        </div>
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
