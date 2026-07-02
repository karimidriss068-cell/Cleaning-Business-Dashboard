"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import { shortDate } from "@/lib/format";
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

export type LeadRow = {
  id: string;
  name: string | null;
  contact_info: string | null;
  source: string | null;
  status: string;
  created_at: string;
  campaignId: string | null;
  campaignName: string | null;
  accountId: string | null;
  accountName: string | null;
};

type Ref = { id: string; name: string };

const LEAD_STATUSES = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  booked: "Booked",
  dead: "Dead",
};

export function LeadsTable({
  leads,
  accounts,
  campaigns,
}: {
  leads: LeadRow[];
  accounts: Ref[];
  campaigns: (Ref & { account_id: string })[];
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string>("all");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const campaignOptions = useMemo(
    () =>
      accountId === "all"
        ? campaigns
        : campaigns.filter((c) => c.account_id === accountId),
    [campaigns, accountId],
  );

  const filtered = useMemo(
    () =>
      leads.filter((l) => {
        if (accountId !== "all" && l.accountId !== accountId) return false;
        if (campaignId !== "all" && l.campaignId !== campaignId) return false;
        if (status !== "all" && l.status !== status) return false;
        return true;
      }),
    [leads, accountId, campaignId, status],
  );

  const accountItems = {
    all: "All accounts",
    ...Object.fromEntries(accounts.map((a) => [a.id, a.name])),
  };
  const campaignItems = {
    all: "All campaigns",
    ...Object.fromEntries(campaignOptions.map((c) => [c.id, c.name])),
  };
  const statusItems = { all: "All statuses", ...LEAD_STATUSES };

  async function updateStatus(leadId: string, newStatus: string) {
    setBusyId(leadId);
    const supabase = createClient();
    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus as Enums<"lead_status"> })
      .eq("id", leadId);
    setBusyId(null);
    if (error) {
      toast.error("Could not update status", { description: error.message });
      return;
    }
    toast.success("Lead status updated");
    router.refresh();
  }

  async function convertToAppointment(lead: LeadRow) {
    if (!lead.accountId) {
      toast.error("Lead has no account — cannot create appointment");
      return;
    }
    setBusyId(lead.id);
    const supabase = createClient();
    // revenue_owed is auto-filled from the account price by a DB trigger.
    const { error: apptError } = await supabase.from("appointments").insert({
      lead_id: lead.id,
      account_id: lead.accountId,
      status: "booked",
    });
    if (apptError) {
      setBusyId(null);
      toast.error("Could not create appointment", {
        description: apptError.message,
      });
      return;
    }
    await supabase.from("leads").update({ status: "booked" }).eq("id", lead.id);
    setBusyId(null);
    toast.success("Appointment created");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={accountId}
          onValueChange={(v) => {
            setAccountId(v as string);
            setCampaignId("all");
          }}
          items={accountItems}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={campaignId}
          onValueChange={(v) => setCampaignId(v as string)}
          items={campaignItems}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaignOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => setStatus(v as string)}
          items={statusItems}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(LEAD_STATUSES).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto self-center text-sm text-muted-foreground tabular-nums">
          {filtered.length} lead{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-muted-foreground"
                >
                  No leads match these filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((lead) => {
              const canConvert =
                lead.status === "qualified" || lead.status === "booked";
              return (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">
                    {lead.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.contact_info ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.campaignId ? (
                      <Link
                        href={`/campaigns/${lead.campaignId}`}
                        className="hover:text-primary hover:underline"
                      >
                        {lead.campaignName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.accountName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.source ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={lead.status}
                      onValueChange={(v) => updateStatus(lead.id, v as string)}
                      items={LEAD_STATUSES}
                      disabled={busyId === lead.id}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LEAD_STATUSES).map(([v, label]) => (
                          <SelectItem key={v} value={v}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {shortDate(lead.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {canConvert ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === lead.id}
                        onClick={() => convertToAppointment(lead)}
                      >
                        Convert to appt
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
