import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { InvoiceStatus } from "@/lib/status";
import { addDays, nyDayRangeUtc } from "@/lib/format";

type Db = SupabaseClient<Database>;

const personName = (c: { first_name: string; last_name: string | null } | null) => (c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null);

export type FinanceSettings = {
  taxRatePpm: number;
  defaultLineTaxable: boolean;
  invoiceDueDays: number;
  thresholdCents: number;
  warnBps: number;
};

export async function loadSettings(db: Db): Promise<FinanceSettings> {
  const { data, error } = await db.from("business_settings").select("tax_rate_ppm, default_line_taxable, invoice_due_days, form_1099_threshold_cents, form_1099_warn_bps").single();
  if (error) throw new Error(`Loading settings failed: ${error.message}`);
  return {
    taxRatePpm: data.tax_rate_ppm,
    defaultLineTaxable: data.default_line_taxable,
    invoiceDueDays: data.invoice_due_days,
    thresholdCents: data.form_1099_threshold_cents,
    warnBps: data.form_1099_warn_bps,
  };
}

// Invoices -------------------------------------------------------------------------

export type InvoiceRow = {
  id: string;
  number: number;
  status: InvoiceStatus;
  customer: string;
  issuedOn: string | null;
  dueOn: string | null;
  totalCents: number;
  paidCents: number;
  collected: boolean;
};

export async function loadInvoiceList(db: Db): Promise<InvoiceRow[]> {
  const { data, error } = await db
    .from("invoices")
    .select("id, invoice_number, status, issued_on, due_on, total_cents, amount_paid_cents, collected_at, contact:contacts(first_name, last_name), account:accounts(name)")
    .order("invoice_number", { ascending: false })
    .limit(400);
  if (error) throw new Error(`Loading invoices failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.invoice_number,
    status: r.status,
    customer: r.account?.name ?? personName(r.contact) ?? "Customer",
    issuedOn: r.issued_on,
    dueOn: r.due_on,
    totalCents: r.total_cents ?? 0,
    paidCents: r.amount_paid_cents,
    collected: r.collected_at !== null,
  }));
}

export type ReadyVisit = { jobId: string; customer: string; service: string; completedOn: string; priceCents: number };
export type ReadyQuote = { quoteId: string; number: number; customer: string; status: string; totalCents: number };

/** Completed visits and accepted quotes that don't have a live invoice yet. */
export async function loadReadyToInvoice(db: Db, today: string): Promise<{ visits: ReadyVisit[]; quotes: ReadyQuote[] }> {
  const since = nyDayRangeUtc(addDays(today, -120)).start.toISOString();
  const [jobsRes, quotesRes] = await Promise.all([
    db
      .from("jobs")
      .select("id, price_cents, completed_at, quote_id, service:services(name), contact:contacts(first_name, last_name), account:accounts(name)")
      .eq("status", "completed")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(150),
    db.from("quotes").select("id, quote_number, status, total_cents, contact:contacts(first_name, last_name), account:accounts(name)").eq("status", "accepted").order("accepted_at", { ascending: false }).limit(30),
  ]);
  if (jobsRes.error) throw new Error(`Loading visits failed: ${jobsRes.error.message}`);
  if (quotesRes.error) throw new Error(`Loading quotes failed: ${quotesRes.error.message}`);
  const jobs = jobsRes.data ?? [];
  const quotes = quotesRes.data ?? [];

  const [linesRes, quoteInvRes] = await Promise.all([
    jobs.length
      ? db.from("invoice_line_items").select("job_id").in("job_id", jobs.map((j) => j.id)).eq("voided", false)
      : Promise.resolve({ data: [] as { job_id: string | null }[], error: null }),
    db.from("invoices").select("quote_id").not("quote_id", "is", null).neq("status", "void"),
  ]);
  if (linesRes.error) throw new Error(`Loading invoice lines failed: ${linesRes.error.message}`);
  if (quoteInvRes.error) throw new Error(`Loading quote invoices failed: ${quoteInvRes.error.message}`);
  const billedJobs = new Set((linesRes.data ?? []).map((l) => l.job_id));
  const billedQuotes = new Set((quoteInvRes.data ?? []).map((i) => i.quote_id));

  return {
    visits: jobs
      .filter((j) => !billedJobs.has(j.id) && !(j.quote_id && billedQuotes.has(j.quote_id)))
      .slice(0, 12)
      .map((j) => ({
        jobId: j.id,
        customer: j.account?.name ?? personName(j.contact) ?? "Customer",
        service: j.service?.name ?? "Visit",
        completedOn: (j.completed_at ?? "").slice(0, 10),
        priceCents: j.price_cents,
      })),
    quotes: quotes
      .filter((q) => !billedQuotes.has(q.id))
      .slice(0, 8)
      .map((q) => ({ quoteId: q.id, number: q.quote_number, customer: q.account?.name ?? personName(q.contact) ?? "Customer", status: q.status, totalCents: q.total_cents ?? 0 })),
  };
}

export type InvoiceDetail = {
  id: string;
  number: number;
  status: InvoiceStatus;
  updatedAt: string;
  customer: string;
  contactId: string | null;
  accountId: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  notes: string | null;
  payToken: string;
  voidReason: string | null;
  quoteNumber: number | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  taxRatePpm: number;
  totalCents: number;
  depositCents: number;
  paidCents: number;
  collected: { at: string; note: string } | null;
  lines: { id: string; jobId: string | null; description: string; quantity: number; unitPriceCents: number; taxable: boolean }[];
  payments: { id: string; amountCents: number; method: string; source: string; reference: string | null; receivedAt: string | null; status: string; refundedCents: number }[];
  log: { id: string; at: string; action: string; detail: Record<string, unknown> }[];
  cards: { id: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; isDefault: boolean }[];
};

export async function loadInvoiceDetail(db: Db, id: string): Promise<InvoiceDetail | null> {
  const { data: inv, error } = await db
    .from("invoices")
    .select(
      "id, invoice_number, status, updated_at, contact_id, account_id, issued_on, due_on, notes, pay_token, void_reason, subtotal_cents, discount_cents, tax_cents, tax_rate_ppm, total_cents, deposit_cents, amount_paid_cents, collected_at, collected_note, contact:contacts(first_name, last_name), account:accounts(name), quote:quotes(quote_number)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading the invoice failed: ${error.message}`);
  if (!inv) return null;

  const [linesRes, paymentsRes, cardsRes] = await Promise.all([
    db.from("invoice_line_items").select("id, job_id, description, quantity, unit_price_cents, taxable").eq("invoice_id", id).eq("voided", false).order("sort_order").order("created_at"),
    db.from("payments").select("id, amount_cents, method, source, reference, received_at, status, refunds(id, amount_cents)").eq("invoice_id", id).order("created_at"),
    inv.account_id || inv.contact_id
      ? db
          .from("payment_methods")
          .select("id, brand, last4, exp_month, exp_year, is_default, account_id, contact_id")
          .or([inv.account_id ? `account_id.eq.${inv.account_id}` : null, inv.contact_id ? `contact_id.eq.${inv.contact_id}` : null].filter(Boolean).join(","))
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [linesRes, paymentsRes, cardsRes]) if (r.error) throw new Error(`Loading the invoice failed: ${r.error.message}`);
  // The invoice's own history plus that of its payments and refunds.
  const logIds = [id, ...(paymentsRes.data ?? []).flatMap((p) => [p.id, ...(p.refunds ?? []).map((r) => r.id)])];
  const logRes = await db.from("finance_log").select("id, occurred_at, entity, action, detail").in("entity_id", logIds).order("occurred_at", { ascending: false }).limit(60);
  if (logRes.error) throw new Error(`Loading the invoice history failed: ${logRes.error.message}`);

  return {
    id: inv.id,
    number: inv.invoice_number,
    status: inv.status,
    updatedAt: inv.updated_at,
    customer: inv.account?.name ?? personName(inv.contact) ?? "Customer",
    contactId: inv.contact_id,
    accountId: inv.account_id,
    issuedOn: inv.issued_on,
    dueOn: inv.due_on,
    notes: inv.notes,
    payToken: inv.pay_token,
    voidReason: inv.void_reason,
    quoteNumber: inv.quote?.quote_number ?? null,
    subtotalCents: inv.subtotal_cents,
    discountCents: inv.discount_cents,
    taxCents: inv.tax_cents,
    taxRatePpm: inv.tax_rate_ppm,
    totalCents: inv.total_cents ?? 0,
    depositCents: inv.deposit_cents,
    paidCents: inv.amount_paid_cents,
    collected: inv.collected_at && inv.collected_note ? { at: inv.collected_at, note: inv.collected_note } : null,
    lines: (linesRes.data ?? []).map((l) => ({ id: l.id, jobId: l.job_id, description: l.description, quantity: l.quantity, unitPriceCents: l.unit_price_cents, taxable: l.taxable })),
    payments: (paymentsRes.data ?? []).map((p) => ({
      id: p.id,
      amountCents: p.amount_cents,
      method: p.method,
      source: p.source,
      reference: p.reference,
      receivedAt: p.received_at,
      status: p.status,
      refundedCents: (p.refunds ?? []).reduce((s, r) => s + r.amount_cents, 0),
    })),
    log: (logRes.data ?? []).map((l) => ({ id: l.id, at: l.occurred_at, action: `${l.entity}:${l.action}`, detail: (l.detail ?? {}) as Record<string, unknown> })),
    cards: (cardsRes.data ?? []).map((c) => ({ id: c.id, brand: c.brand, last4: c.last4, expMonth: c.exp_month, expYear: c.exp_year, isDefault: c.is_default })),
  };
}

// Payouts ----------------------------------------------------------------------------

export type PayoutItemView = { id: string; amountCents: number; service: string; completedOn: string; client: string };
export type PayoutView = {
  id: string;
  subcontractorId: string;
  subcontractor: string;
  w9OnFile: boolean;
  periodStart: string;
  periodEnd: string;
  status: Database["public"]["Enums"]["payout_status"];
  totalCents: number;
  updatedAt: string;
  paidAt: string | null;
  paidMethod: string | null;
  paidReference: string | null;
  voidReason: string | null;
  items: PayoutItemView[];
};

export async function loadPayoutsForWeek(db: Db, weekStart: string): Promise<PayoutView[]> {
  const { data, error } = await db
    .from("payouts")
    .select(
      "id, subcontractor_id, period_start, period_end, status, total_cents, updated_at, paid_at, paid_method, paid_reference, void_reason, subcontractor:subcontractors(display_name, w9_received_at), payout_items(id, amount_cents, voided, assignment:job_assignments(job:jobs(completed_at, service:services(name), contact:contacts(first_name, last_name), account:accounts(name))))",
    )
    .eq("period_start", weekStart)
    .order("created_at");
  if (error) throw new Error(`Loading payouts failed: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id,
    subcontractorId: p.subcontractor_id,
    subcontractor: p.subcontractor?.display_name ?? "Subcontractor",
    w9OnFile: p.subcontractor?.w9_received_at != null,
    periodStart: p.period_start,
    periodEnd: p.period_end,
    status: p.status,
    totalCents: p.total_cents,
    updatedAt: p.updated_at,
    paidAt: p.paid_at,
    paidMethod: p.paid_method,
    paidReference: p.paid_reference,
    voidReason: p.void_reason,
    items: (p.payout_items ?? [])
      .filter((i) => !i.voided || p.status === "void")
      .map((i) => {
        const job = i.assignment?.job;
        return {
          id: i.id,
          amountCents: i.amount_cents,
          service: job?.service?.name ?? "Visit",
          completedOn: (job?.completed_at ?? "").slice(0, 10),
          client: job?.account?.name ?? personName(job?.contact ?? null) ?? "Customer",
        };
      }),
  }));
}

export type CandidateView = {
  assignmentId: string;
  subcontractorId: string;
  subcontractor: string;
  completedOn: string;
  service: string;
  client: string;
  payCents: number | null;
  invoiceId: string | null;
  invoiceNumber: number | null;
  invoiceBalanceCents: number | null;
  reason: string | null;
  payoutId: string | null;
};

export async function loadCandidates(db: Db, weekStart: string): Promise<CandidateView[]> {
  const { data, error } = await db.rpc("payout_candidates", { p_week_start: weekStart });
  if (error) throw new Error(`Loading payout candidates failed: ${error.message}`);
  return (data ?? []).map((c) => ({
    assignmentId: c.assignment_id,
    subcontractorId: c.subcontractor_id,
    subcontractor: c.subcontractor_name,
    completedOn: c.completed_on,
    service: c.service_name,
    client: c.client_name ?? "Customer",
    payCents: c.pay_cents,
    invoiceId: c.invoice_id,
    invoiceNumber: c.invoice_number,
    invoiceBalanceCents: c.invoice_balance_cents,
    reason: c.reason_code,
    payoutId: c.payout_id,
  }));
}

export type Contractor1099 = {
  subcontractorId: string;
  displayName: string;
  legalName: string | null;
  businessEntity: string;
  status: string;
  w9OnFile: boolean;
  paidCents: number;
  approvedCents: number;
  payoutCount: number;
  w9DocId: string | null;
};

export async function load1099(db: Db, year: number): Promise<Contractor1099[]> {
  const [sumRes, docsRes] = await Promise.all([
    db.rpc("contractor_1099_summary", { p_year: year }),
    db.from("subcontractor_documents").select("id, subcontractor_id, created_at").eq("type", "w9").order("created_at", { ascending: false }),
  ]);
  if (sumRes.error) throw new Error(`Loading 1099 totals failed: ${sumRes.error.message}`);
  if (docsRes.error) throw new Error(`Loading W-9s failed: ${docsRes.error.message}`);
  const latestDoc = new Map<string, string>();
  for (const d of docsRes.data ?? []) if (!latestDoc.has(d.subcontractor_id)) latestDoc.set(d.subcontractor_id, d.id);
  return (sumRes.data ?? []).map((r) => ({
    subcontractorId: r.subcontractor_id,
    displayName: r.display_name,
    legalName: r.legal_name,
    businessEntity: r.business_entity,
    status: r.status,
    w9OnFile: r.w9_received_at !== null,
    paidCents: r.paid_cents,
    approvedCents: r.approved_cents,
    payoutCount: r.payout_count,
    w9DocId: latestDoc.get(r.subcontractor_id) ?? null,
  }));
}

// Finance months -------------------------------------------------------------------------

export type FinanceMonth = { monthStart: string; revenueCents: number; collectedCents: number; outstandingCents: number; payoutsCents: number | null; marginCents: number | null };

export async function loadFinanceMonths(db: Db, months = 6): Promise<FinanceMonth[]> {
  const { data, error } = await db.rpc("finance_summary", { p_months: months });
  if (error) throw new Error(`Loading the finance summary failed: ${error.message}`);
  return (data ?? []).map((m) => ({
    monthStart: m.month_start,
    revenueCents: m.revenue_cents,
    collectedCents: m.collected_cents,
    outstandingCents: m.outstanding_cents,
    payoutsCents: m.payouts_cents,
    marginCents: m.margin_cents,
  }));
}
