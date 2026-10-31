"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { BOROUGHS, SERVICE_TYPES, SOURCES, boroughLabel, formatPhone, serviceTypeLabel, sourceLabel } from "@/lib/leads";
import type { DuplicateMatch } from "@/lib/schemas/leads";
import { stageLabel } from "@/lib/leads";
import type { LeadStage } from "@/lib/status";
import { createLead, findDuplicates } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Drawer } from "@/components/system/drawer";

const OPEN_EVENT = "kc:quick-add-lead";

/** Opens the quick-add sheet from anywhere (the + button, Cmd+K). */
export function openQuickAddLead() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** The + button on the Leads page. */
export function NewLeadButton() {
  return (
    <Button onClick={openQuickAddLead} className="h-11 md:h-9">
      <Plus aria-hidden /> New lead
    </Button>
  );
}

/** Mounted once in the app shell for office roles. */
export function QuickAddLead() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);
  return (
    <Drawer open={open} onOpenChange={setOpen} title="New lead" description="Name and a way to reach them is enough; the rest can wait.">
      {open && <QuickAddForm onDone={() => setOpen(false)} />}
    </Drawer>
  );
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceType, setServiceType] = useState<string>("residential");
  const [source, setSource] = useState<string>("google");
  const [borough, setBorough] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dups, setDups] = useState<DuplicateMatch[]>([]);
  const [ack, setAck] = useState(false);
  const seq = useRef(0);

  // Check for an existing contact as the phone or email settles.
  useEffect(() => {
    const id = ++seq.current;
    const t = window.setTimeout(async () => {
      const found = await findDuplicates({ phone, email });
      if (id === seq.current) {
        setDups(found);
        setAck(false);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [phone, email]);

  const serviceItems = SERVICE_TYPES.map((s) => ({ value: s, label: serviceTypeLabel[s] }));
  const sourceItems = SOURCES.map((s) => ({ value: s, label: sourceLabel[s] }));
  const boroughItems = [{ value: "none", label: "Not sure" }, ...BOROUGHS.map((b) => ({ value: b, label: boroughLabel(b) }))];
  const blocked = dups.length > 0 && !ack;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createLead({
        firstName, lastName, phone, email, serviceType, source,
        borough: borough === "none" ? "" : borough,
        notes,
        allowDuplicate: ack,
      });
      if (res.ok) {
        toast.success(`${firstName} added`, { description: "Follow-up set for tomorrow.", action: { label: "Open", onClick: () => router.push(`/leads?lead=${res.leadId}`) } });
        router.refresh();
        onDone();
        return;
      }
      if (res.code === "duplicate" && res.duplicates) setDups(res.duplicates);
      setError(res.message);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qa-first">First name</Label>
          <Input id="qa-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus autoComplete="off" className="h-11 md:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qa-last">Last name</Label>
          <Input id="qa-last" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" className="h-11 md:h-9" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qa-phone">Phone</Label>
        <Input id="qa-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(718) 555-0142" autoComplete="off" className="h-11 md:h-9" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qa-email">Email</Label>
        <Input id="qa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-11 md:h-9" />
      </div>

      {dups.length > 0 && (
        <div role="alert" className="space-y-2 rounded-sm border border-warning/40 bg-warning-soft p-3 text-sm" data-testid="duplicate-warning">
          <p className="flex items-start gap-2 font-medium text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>This looks like someone already in your contacts</span>
          </p>
          <ul className="space-y-1 text-ink">
            {dups.map((d) => (
              <li key={d.contactId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {d.name} · {d.phone ? formatPhone(d.phone) : d.email} <span className="text-ink-muted">(same {d.matched.join(" and ")})</span>
                </span>
                {d.openLeadId ? (
                  <a href={`/leads?lead=${d.openLeadId}`} className="text-brand-text underline underline-offset-2" onClick={onDone}>
                    Open lead ({stageLabel[(d.openLeadStage ?? "new") as LeadStage]})
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          {!ack && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setAck(true)} className="h-9">
              Add as a new lead anyway
            </Button>
          )}
          {ack && <p className="text-[13px] text-ink-muted">Okay, this will be added as a new contact.</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Service</Label>
          <Select items={serviceItems} value={serviceType} onValueChange={(v) => v && setServiceType(v)}>
            <SelectTrigger className="h-11 w-full md:h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{serviceItems.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select items={sourceItems} value={source} onValueChange={(v) => v && setSource(v)}>
            <SelectTrigger className="h-11 w-full md:h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{sourceItems.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Borough</Label>
        <Select items={boroughItems} value={borough} onValueChange={(v) => v && setBorough(v)}>
          <SelectTrigger className="h-11 w-full md:h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{boroughItems.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qa-notes">Notes</Label>
        <Textarea id="qa-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Size of the place, timing, anything they said" />
      </div>

      {error && !dups.length && (
        <p role="alert" className="text-[13px] text-danger">{error}</p>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone} className="h-11 sm:h-9">Cancel</Button>
        <Button type="submit" disabled={pending || blocked || firstName.trim() === ""} className="h-11 sm:h-9">
          {pending ? "Adding…" : "Add lead"}
        </Button>
      </div>
    </form>
  );
}
