/**
 * Tops up the demo data for the CURRENT New York month so the Growth flow diagram has costs to show:
 * ad spend for every demo campaign from the 1st to today, a few typical other costs, and demo visits whose
 * end time has passed marked completed (their cleaner pay snapshot is already on the assignment).
 *
 *   node scripts/seed-month.mts --project-ref lijsaulkeaqlriwqgxty [--dry-run]
 *
 * Safe to re-run any day: ids are fixed per campaign and day, and every insert skips what exists. Every row has
 * an id starting 5eed0000-, so `node scripts/seed.mts ... --purge` removes it with the rest of the demo data.
 * Refuses unless --project-ref names the cleaning project and matches .env.local.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const CLEANING_PROJECT_REF = "lijsaulkeaqlriwqgxty";
const { values } = parseArgs({ options: { "project-ref": { type: "string" }, "dry-run": { type: "boolean", default: false } } });
if (values["project-ref"] !== CLEANING_PROJECT_REF) {
  console.error(`pass --project-ref ${CLEANING_PROJECT_REF} explicitly`);
  process.exit(1);
}
process.loadEnvFile(".env.local");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(CLEANING_PROJECT_REF)) {
  console.error("refusing: .env.local isn't the cleaning project");
  process.exit(1);
}

// Spend per campaign and day is spread by the campaign's id so it looks lived-in but is the same on every run.
const sql = `
begin;
do $topup$
declare
  d_start date := date_trunc('month', timezone('America/New_York', now()))::date;
  d_end date := timezone('America/New_York', now())::date;
begin
  -- ad spend: one figure per demo campaign per day, 1st of the month through today
  delete from public.marketing_daily_stats where id::text between '5eed0000-0003-4000-8000-000000100000' and '5eed0000-0003-4000-8000-0000001fffff';
  insert into public.marketing_daily_stats (id, campaign_id, date, spend_cents, creative, impressions, clicks, leads)
  select ('5eed0000-0003-4000-8000-' || lpad(to_hex(1048576 + c.n * 1000 + g.i), 12, '0'))::uuid,
         c.id, d_start + g.i,
         case c.platform when 'google' then 1600 + (g.i * 410) % 900
                         when 'meta' then 1300 + (g.i * 330) % 700
                         when 'yelp' then 800 + (g.i * 170) % 400
                         else 500 + (g.i * 90) % 300 end,
         null,
         900 + (g.i * 53) % 400, 14 + (g.i * 3) % 9, (g.i + c.n) % 3 / 2
  from (select id, platform, row_number() over (order by id)::int n from public.marketing_campaigns where id::text like '5eed0000-%') c
  cross join generate_series(0, d_end - d_start) as g(i)
  on conflict do nothing;

  -- other costs this month: software and insurance on the 1st, supplies and transit as they happen
  insert into public.expenses (id, vendor_id, category, description, amount_cents, incurred_on, job_id, receipt_path, created_by)
  select ('5eed0000-0016-4000-8000-' || lpad(to_hex(1048576 + e.n), 12, '0'))::uuid,
         (select v.id from public.vendors v where v.id::text like '5eed0000-%' and v.category::text = e.category order by v.id limit 1),
         e.category::public.expense_category, e.description, e.amount, d_start + e.day_offset, null, null, null
  from (values
    (1, 'software', 'Monthly scheduling subscription', 9900, 0),
    (2, 'insurance', 'General liability premium', 48500, 0),
    (3, 'supplies', 'Microfiber cloths and mop heads', 18700, 1),
    (4, 'supplies', 'Concentrated all-purpose cleaner', 12400, 2),
    (5, 'transit', 'Crew subway/bus fares (OMNY)', 4200, 2)
  ) as e(n, category, description, amount, day_offset)
  where d_start + e.day_offset <= d_end
  on conflict do nothing;


  -- every day so far has at least three completed demo visits: copy recent completed ones forward when short
  create temp table clone_src on commit drop as
  select j.id src_id, d.day, row_number() over (partition by d.day order by j.scheduled_start desc) rn
  from generate_series(d_start, d_end, interval '1 day') as d(day)
  join public.jobs j on j.id::text like '5eed0000-%' and j.status = 'completed' and j.scheduled_start < d_start::timestamp at time zone 'America/New_York'
  where (select count(*) from public.jobs x where x.id::text like '5eed0000-%' and x.status = 'completed'
         and (x.scheduled_start at time zone 'America/New_York')::date = d.day::date) < 3;
  delete from clone_src where rn > 3;

  insert into public.jobs (id, series_id, quote_id, contact_id, account_id, property_id, service_id, crew_id, scheduled_start, scheduled_end,
                           status, price_cents, completed_at, completed_by, cancellation_reason, notes, crew_notes, external_id, ghl_appointment_id)
  select ('5eed0000-0010-4000-8000-' || lpad(to_hex(1048576 + (c.day::date - d_start) * 10 + c.rn::int), 12, '0'))::uuid,
         null, null, j.contact_id, j.account_id, j.property_id, j.service_id, j.crew_id,
         ((j.scheduled_start at time zone 'America/New_York')::time + c.day::date)::timestamp at time zone 'America/New_York',
         ((j.scheduled_end at time zone 'America/New_York')::time + c.day::date)::timestamp at time zone 'America/New_York',
         'completed', j.price_cents,
         ((j.scheduled_end at time zone 'America/New_York')::time + c.day::date)::timestamp at time zone 'America/New_York',
         null, null, null, j.crew_notes, null, null
  from clone_src c join public.jobs j on j.id = c.src_id
  on conflict do nothing;

  insert into public.job_assignments (id, job_id, subcontractor_id, minutes_worked)
  select ('5eed0000-0011-4000-8000-' || lpad(to_hex(1048576 + (c.day::date - d_start) * 100 + c.rn::int * 10 + a.k::int), 12, '0'))::uuid,
         ('5eed0000-0010-4000-8000-' || lpad(to_hex(1048576 + (c.day::date - d_start) * 10 + c.rn::int), 12, '0'))::uuid,
         a.subcontractor_id, a.minutes_worked
  from clone_src c
  join (select a.*, row_number() over (partition by a.job_id order by a.id) k from public.job_assignments a) a on a.job_id = c.src_id
  on conflict do nothing;

  -- demo visits whose time has passed are done (cleaner pay is already on their assignments)
  update public.jobs set status = 'completed', completed_at = scheduled_end
  where id::text like '5eed0000-%' and status = 'scheduled' and scheduled_end < now();
end
$topup$;

select 'ad_spend_cents' k, coalesce(sum(spend_cents), 0) v from public.marketing_daily_stats
  where id::text like '5eed0000-%' and date >= date_trunc('month', timezone('America/New_York', now()))::date
union all select 'expenses_cents', coalesce(sum(amount_cents), 0) from public.expenses
  where id::text like '5eed0000-%' and incurred_on >= date_trunc('month', timezone('America/New_York', now()))::date
union all select 'completed_visits', count(*) from public.jobs
  where id::text like '5eed0000-%' and status = 'completed' and completed_at >= date_trunc('month', timezone('America/New_York', now())) ;
commit;
`;

if (values["dry-run"]) {
  console.log(sql);
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), "seed-month-"));
const file = join(dir, "query.sql");
writeFileSync(file, sql);
try {
  const res = spawnSync("scripts/supabase-cleaning.sh", ["db", "query", "-f", file, "-o", "json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (res.status !== 0 || /ERROR:/.test(out)) {
    console.error(out.slice(-900));
    process.exit(1);
  }
  console.log(out.slice(out.indexOf("{")).slice(0, 600));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
