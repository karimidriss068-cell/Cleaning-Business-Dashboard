"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { shortDate } from "@/lib/format";
import {
  CHANNEL_LABELS,
  CONTACT_STATUS_LABELS,
  type OutreachChannel,
  type OutreachContactStatus,
} from "@/lib/outreach";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type OutreachRow = {
  id: string;
  name: string | null;
  contact_info: string | null;
  niche: string | null;
  channel: OutreachChannel;
  status: OutreachContactStatus;
  scriptId: string | null;
  scriptName: string | null;
  leadId: string | null;
  created_at: string;
  contacted_at: string | null;
  replied_at: string | null;
  call_booked_at: string | null;
  call_held_at: string | null;
  closed_at: string | null;
};

export function OutreachContactsTable({
  contacts,
  scripts,
  showFilters = true,
}: {
  contacts: OutreachRow[];
  scripts: { id: string; name: string }[];
  showFilters?: boolean;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [scriptId, setScriptId] = useState("all");
  const [niche, setNiche] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const niches = useMemo(
    () =>
      Array.from(
        new Set(contacts.map((c) => c.niche).filter((n): n is string => !!n)),
      ).sort(),
    [contacts],
  );

  const filtered = useMemo(
    () =>
      contacts.filter((c) => {
        if (channel !== "all" && c.channel !== channel) return false;
        if (status !== "all" && c.status !== status) return false;
        if (scriptId !== "all" && c.scriptId !== scriptId) return false;
        if (niche !== "all" && c.niche !== niche) return false;
        return true;
      }),
    [contacts, channel, status, scriptId, niche],
  );

  async function updateStatus(row: OutreachRow, newStatus: OutreachContactStatus) {
    setBusyId(row.id);
    const supabase = createClient();
    // Stamp the stage timestamp (if not already set) so manually-updated
    // contacts still feed the funnel time metrics.
    const patch: TablesUpdate<"outreach_contacts"> = { status: newStatus };
    const now = new Date().toISOString();
    if (newStatus === "contacted" && !row.contacted_at) patch.contacted_at = now;
    else if (newStatus === "replied" && !row.replied_at) patch.replied_at = now;
    else if (newStatus === "call_booked" && !row.call_booked_at) patch.call_booked_at = now;
    else if (newStatus === "call_held" && !row.call_held_at) patch.call_held_at = now;
    else if (newStatus === "closed" && !row.closed_at) patch.closed_at = now;

    const { error } = await supabase
      .from("outreach_contacts")
      .update(patch)
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast.error("Could not update status", { description: error.message });
      return;
    }
    toast.success("Status updated");
    router.refresh();
  }

  async function convertToLead(row: OutreachRow) {
    setBusyId(row.id);
    const supabase = createClient();
    // Outreach-sourced lead — no ad campaign. call_booked -> qualified, closed -> booked.
    const leadStatus = row.status === "closed" ? "booked" : "qualified";
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .insert({
        name: row.name,
        contact_info: row.contact_info,
        source: "outreach",
        status: leadStatus,
      })
      .select("id")
      .single();
    if (leadErr || !lead) {
      setBusyId(null);
      toast.error("Could not create lead", { description: leadErr?.message });
      return;
    }
    const { error: linkErr } = await supabase
      .from("outreach_contacts")
      .update({ lead_id: lead.id })
      .eq("id", row.id);
    setBusyId(null);
    if (linkErr) {
      toast.error("Lead created but link failed", {
        description: linkErr.message,
      });
      return;
    }
    toast.success("Converted to lead");
    router.refresh();
  }

  const channelItems = { all: "All channels", ...CHANNEL_LABELS };
  const statusItems = { all: "All statuses", ...CONTACT_STATUS_LABELS };
  const scriptItems = {
    all: "All scripts",
    ...Object.fromEntries(scripts.map((s) => [s.id, s.name])),
  };
  const nicheItems = {
    all: "All niches",
    ...Object.fromEntries(niches.map((n) => [n, n])),
  };

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-wrap gap-3">
          <Select value={channel} onValueChange={(v) => setChannel(v as string)} items={channelItems}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={scriptId} onValueChange={(v) => setScriptId(v as string)} items={scriptItems}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scripts</SelectItem>
              {scripts.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => setStatus(v as string)} items={statusItems}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(CONTACT_STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {niches.length > 0 && (
            <Select value={niche} onValueChange={(v) => setNiche(v as string)} items={nicheItems}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All niches</SelectItem>
                {niches.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="ml-auto self-center text-sm text-muted-foreground tabular-nums">
            {filtered.length} contact{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Niche</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Script</TableHead>
              <TableHead className="w-44">Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No contacts match these filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => {
              const canConvert =
                (row.status === "call_booked" || row.status === "closed") &&
                !row.leadId;
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.contact_info ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.niche ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{CHANNEL_LABELS[row.channel]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.scriptId ? (
                      <Link href={`/outreach/${row.scriptId}`} className="hover:text-primary hover:underline">
                        {row.scriptName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.status}
                      onValueChange={(v) => updateStatus(row, v as OutreachContactStatus)}
                      items={CONTACT_STATUS_LABELS}
                      disabled={busyId === row.id}
                    >
                      <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONTACT_STATUS_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {shortDate(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.leadId ? (
                      <Link
                        href="/leads"
                        className="text-xs text-[var(--success)] hover:underline"
                      >
                        Linked ✓
                      </Link>
                    ) : canConvert ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === row.id}
                        onClick={() => convertToLead(row)}
                      >
                        Convert to lead
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
