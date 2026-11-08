import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { projectMoney, type ProjectMoney } from "@/lib/projects";
import type { Milestone, ProjectStatus } from "@/lib/schemas/projects";

export type ProjectInvoice = { id: string; number: number; status: string; milestone: Milestone; subtotalCents: number; discountCents: number; totalCents: number; paidCents: number };
export type ProjectDay = {
  jobId: string;
  updatedAt: string;
  start: string;
  end: string;
  status: string;
  notes: string | null;
  assignments: { id: string; subcontractorId: string; name: string; payCents: number | null }[];
};
export type ProjectCost = { id: string; category: string; description: string; amountCents: number; incurredOn: string };
export type ProjectDetail = {
  id: string;
  number: number;
  title: string;
  status: ProjectStatus;
  updatedAt: string;
  contractCents: number;
  depositBps: number;
  bidId: string;
  bidNumber: number;
  bidVersion: number;
  leadId: string;
  accountName: string;
  contactName: string;
  address: string | null;
  startsOn: string | null;
  endsOn: string | null;
  invoices: ProjectInvoice[];
  days: ProjectDay[];
  costs: ProjectCost[];
  money: ProjectMoney;
};
export type ProjectSummary = { id: string; number: number; title: string; accountName: string; status: ProjectStatus; contractCents: number; money: ProjectMoney };
export type CleanerOption = { id: string; name: string };

const sumInvoice = (i: { subtotal_cents: number; discount_cents: number }) => Number(i.subtotal_cents) - Number(i.discount_cents);

type RawProject = {
  id: string; project_number: number; title: string; status: ProjectStatus; updated_at: string; contract_cents: number; deposit_bps: number; bid_version: number;
  estimated_cost_cents: number; estimated_margin_bps: number; starts_on: string | null; ends_on: string | null; bid_id: string; lead_id: string;
  account: { name: string } | null; bid: { bid_number: number } | null;
  contact: { first_name: string; last_name: string | null; address_line1: string | null; zip: string | null; borough: string | null } | null;
  property: { address_line1: string; zip: string; borough: string } | null;
};
const PROJECT_SELECT =
  "id, project_number, title, status, updated_at, contract_cents, deposit_bps, bid_version, estimated_cost_cents, estimated_margin_bps, starts_on, ends_on, bid_id, lead_id, " +
  "account:accounts(name), bid:bids(bid_number), contact:contacts(first_name, last_name, address_line1, zip, borough), property:properties(address_line1, zip, borough)";

async function aggregates(supabase: SupabaseClient<Database>, ids: string[]) {
  if (ids.length === 0) return { invoices: [], jobs: [], costs: [] };
  const [inv, jobs, costs] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, status, milestone, project_id, subtotal_cents, discount_cents, total_cents, amount_paid_cents").in("project_id", ids).neq("status", "void").order("created_at"),
    supabase
      .from("jobs")
      .select("id, project_id, updated_at, scheduled_start, scheduled_end, status, notes, job_assignments(id, subcontractor_id, pay_cents, subcontractor:subcontractors(display_name))")
      .in("project_id", ids)
      .order("scheduled_start"),
    supabase.from("expenses").select("id, project_id, category, description, amount_cents, incurred_on").in("project_id", ids).order("incurred_on", { ascending: false }),
  ]);
  if (inv.error) throw new Error(`Project invoices query failed: ${inv.error.message}`);
  if (jobs.error) throw new Error(`Project days query failed: ${jobs.error.message}`);
  if (costs.error) throw new Error(`Project costs query failed: ${costs.error.message}`);
  return {
    invoices: inv.data ?? [],
    jobs: (jobs.data ?? []) as unknown as {
      id: string; project_id: string; updated_at: string; scheduled_start: string; scheduled_end: string; status: string; notes: string | null;
      job_assignments: { id: string; subcontractor_id: string; pay_cents: number | null; subcontractor: { display_name: string } | null }[];
    }[],
    costs: costs.data ?? [],
  };
}

function moneyFor(p: RawProject, agg: Awaited<ReturnType<typeof aggregates>>): ProjectMoney {
  const invs = agg.invoices.filter((i) => i.project_id === p.id);
  return projectMoney({
    contractCents: Number(p.contract_cents),
    bidCostCents: Number(p.estimated_cost_cents),
    bidMarginBps: p.estimated_margin_bps,
    dayPayCents: agg.jobs.filter((j) => j.project_id === p.id && j.status !== "cancelled").flatMap((j) => j.job_assignments.map((a) => (a.pay_cents === null ? null : Number(a.pay_cents)))),
    costCents: agg.costs.filter((c) => c.project_id === p.id).map((c) => Number(c.amount_cents)),
    invoicedCents: invs.reduce((t, i) => t + sumInvoice(i), 0),
    collectedCents: invs.reduce((t, i) => t + Number(i.amount_paid_cents), 0),
  });
}

/** Every project, newest first, each with its money summary. Owner and admin only (RLS returns nothing otherwise). */
export async function loadProjects(supabase: SupabaseClient<Database>): Promise<ProjectSummary[]> {
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Projects query failed: ${error.message}`);
  const rows = (data ?? []) as unknown as RawProject[];
  const agg = await aggregates(supabase, rows.map((r) => r.id));
  return rows.map((p) => ({ id: p.id, number: Number(p.project_number), title: p.title, accountName: p.account?.name ?? "Account", status: p.status, contractCents: Number(p.contract_cents), money: moneyFor(p, agg) }));
}

export async function loadProject(supabase: SupabaseClient<Database>, id: string): Promise<ProjectDetail | null> {
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`Project query failed: ${error.message}`);
  if (!data) return null;
  const p = data as unknown as RawProject;
  const agg = await aggregates(supabase, [p.id]);
  const addr = p.property ? [p.property.address_line1, p.property.borough.replace("_", " "), p.property.zip].join(", ") : null;
  return {
    id: p.id,
    number: Number(p.project_number),
    title: p.title,
    status: p.status,
    updatedAt: p.updated_at,
    contractCents: Number(p.contract_cents),
    depositBps: p.deposit_bps,
    bidId: p.bid_id,
    bidNumber: Number(p.bid?.bid_number ?? 0),
    bidVersion: p.bid_version,
    leadId: p.lead_id,
    accountName: p.account?.name ?? "Account",
    contactName: `${p.contact?.first_name ?? ""} ${p.contact?.last_name ?? ""}`.trim() || "Contact",
    address: addr,
    startsOn: p.starts_on,
    endsOn: p.ends_on,
    invoices: agg.invoices.map((i) => ({
      id: i.id, number: Number(i.invoice_number), status: i.status, milestone: (i.milestone ?? "progress") as Milestone,
      subtotalCents: Number(i.subtotal_cents), discountCents: Number(i.discount_cents), totalCents: Number(i.total_cents), paidCents: Number(i.amount_paid_cents),
    })),
    days: agg.jobs.map((j) => ({
      jobId: j.id, updatedAt: j.updated_at, start: j.scheduled_start, end: j.scheduled_end, status: j.status, notes: j.notes,
      assignments: j.job_assignments.map((a) => ({ id: a.id, subcontractorId: a.subcontractor_id, name: a.subcontractor?.display_name ?? "Cleaner", payCents: a.pay_cents === null ? null : Number(a.pay_cents) })),
    })),
    costs: agg.costs.map((c) => ({ id: c.id, category: c.category, description: c.description, amountCents: Number(c.amount_cents), incurredOn: c.incurred_on })),
    money: moneyFor(p, agg),
  };
}

/** Active cleaners a work day can be assigned to. */
export async function loadCleaners(supabase: SupabaseClient<Database>): Promise<CleanerOption[]> {
  const { data, error } = await supabase.from("subcontractors").select("id, display_name").eq("status", "active").order("display_name");
  if (error) throw new Error(`Cleaners query failed: ${error.message}`);
  return (data ?? []).map((s) => ({ id: s.id, name: s.display_name }));
}
