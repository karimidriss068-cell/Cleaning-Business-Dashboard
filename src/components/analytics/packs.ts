/**
 * Demo analytics packs (Growth OS v3 + Marketing/Sales), matching
 * design/keystone-dashboard/SPEC.md. Fake, deterministic data only: nothing
 * here reads or writes the database, Meta or GHL.
 */
export type Kind = "money" | "count" | "pct" | "days" | "hours" | "ratio" | "min";
export type Kpi = { label: string; value: number; kind: Kind; delta: string; good: boolean; filter?: string; /** Small second line under the value. */ sub?: string; /** Point-in-time or per-unit: don't scale with the range. */ fixed?: boolean };
export type Row = Record<string, string | number>;
export type Panel = {
  title: string;
  type: "line" | "bar" | "hbar" | "donut" | "table" | "funnel";
  data: Row[];
  /** Numeric series keys (first column is the label key `x`). */
  keys: string[];
  kind: Kind;
  wide?: boolean;
  stacked?: boolean;
  insight?: string;
  /** Per-column formats for tables (overrides the key-name guess). */
  cols?: Record<string, Kind>;
  /** Hide row when a KPI filter is active and row.tag doesn't match. */
};
export type Tab = { label: string; panels: Panel[] };
export type Pack = { title: string; kpis: Kpi[]; tabs: Tab[] };

function rnd(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}
function trend(seed: number, n: number, base: number, keys: string[], spread = 0.18, drift = 0.01): Row[] {
  const r = rnd(seed);
  return Array.from({ length: n }, (_, i) => {
    const row: Row = { x: `W${i + 1}` };
    keys.forEach((k, j) => {
      const b = base * (1 - j * 0.28) * (1 + drift * i);
      row[k] = Math.round(b * (1 - spread / 2 + r() * spread));
    });
    return row;
  });
}
const rows = (labels: string[], cols: Record<string, number[]>): Row[] =>
  labels.map((x, i) => Object.fromEntries([["x", x], ...Object.entries(cols).map(([k, v]) => [k, v[i]])]));

const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Is."];
const CREWS = ["Crew A", "Crew B", "Crew C", "Crew D", "Crew E"];
const CHANNELS = ["Meta", "Google LSA", "Referral", "Organic", "Yelp"];
const REPS = ["Karim", "Dana", "Luis", "Booking bot", "Quote bot"];

export const PACKS: Record<string, Pack> = {
  command: {
    title: "Command analytics",
    kpis: [
      { label: "Revenue", value: 4862000, kind: "money", delta: "+12%", good: true },
      { label: "Lead → cash", value: 6.4, kind: "days", delta: "−1.1d", good: true },
      { label: "Booked jobs", value: 214, kind: "count", delta: "+9%", good: true },
      { label: "Gross margin", value: 41.8, kind: "pct", delta: "+2.3pt", good: true },
    ],
    tabs: [
      { label: "Revenue", panels: [
        { title: "Residential vs commercial vs target", type: "line", wide: true, kind: "money", keys: ["residential", "commercial", "target"], data: trend(11, 12, 820000, ["residential", "commercial", "target"]), insight: "Commercial is pacing 8% over plan — protect Tuesday capacity." },
        { title: "Revenue by borough", type: "hbar", kind: "money", keys: ["revenue"], data: rows(BOROUGHS, { revenue: [1720000, 1380000, 980000, 510000, 272000] }) },
      ]},
      { label: "Speed-to-cash", panels: [
        { title: "Median hours per hop", type: "bar", wide: true, kind: "hours", keys: ["hours"], data: rows(["Lead→reply", "Reply→quote", "Quote→book", "Book→clean", "Clean→invoice", "Invoice→paid"], { hours: [0.3, 5, 31, 52, 3, 62] }), insight: "Invoice→paid is the bottleneck: auto-send a card link at job close." },
        { title: "Bottlenecks", type: "table", kind: "count", keys: ["stuck", "value"], data: rows(["Quote sent, no reply", "Booked, no deposit", "Invoice > 7d"], { stuck: [18, 7, 11], value: [612000, 238000, 401000] }) },
      ]},
      { label: "Geo heat", panels: [
        { title: "Demand / margin / travel by neighborhood", type: "table", wide: true, kind: "pct", keys: ["leads", "margin", "travel_min"], data: rows(["UES", "Park Slope", "Astoria", "Williamsburg", "Riverdale", "LIC"], { leads: [44, 38, 29, 33, 12, 21], margin: [46, 43, 39, 41, 31, 44], travel_min: [18, 22, 27, 20, 41, 16] }), insight: "Riverdale travel eats 9pt of margin — add a $25 zone fee." },
        { title: "Lead mix", type: "donut", kind: "count", keys: ["v"], data: rows(BOROUGHS, { v: [92, 71, 48, 24, 9] }) },
      ]},
    ],
  },
  leads: {
    title: "Pipeline analytics",
    kpis: [
      { label: "New leads", value: 342, kind: "count", delta: "+14%", good: true },
      { label: "Close rate", value: 31.5, kind: "pct", delta: "+1.8pt", good: true },
      { label: "Speed-to-lead", value: 4.2, kind: "min", delta: "−0.9m", good: true },
      { label: "Open quoted", value: 1846000, kind: "money", delta: "+6%", good: true },
    ],
    tabs: [
      { label: "Funnel", panels: [
        { title: "Lead funnel", type: "funnel", wide: true, kind: "count", keys: ["n"], data: rows(["Lead", "Contacted", "Quoted", "Booked", "Paid"], { n: [342, 301, 188, 108, 97] }) },
        { title: "Win / loss reasons", type: "hbar", kind: "count", keys: ["n"], data: rows(["Price", "No reply", "Timing", "Went w/ competitor", "Out of area"], { n: [31, 24, 14, 9, 6] }) },
      ]},
      { label: "Sources", panels: [
        { title: "Leads by source", type: "bar", wide: true, stacked: true, kind: "count", keys: CHANNELS.map((c) => c.toLowerCase().replace(/\W+/g, "_")), data: trend(21, 8, 30, CHANNELS.map((c) => c.toLowerCase().replace(/\W+/g, "_")), 0.3, 0) },
        { title: "CPL & close by source", type: "table", kind: "money", keys: ["cpl", "close_pct"], data: rows(CHANNELS, { cpl: [3400, 5100, 0, 0, 4200], close_pct: [27, 38, 61, 44, 22] }) },
      ]},
    ],
  },
  schedule: {
    title: "Schedule analytics",
    kpis: [
      { label: "Utilization", value: 87, kind: "pct", delta: "+4pt", good: true },
      { label: "Booked hours", value: 1260, kind: "hours", delta: "+11%", good: true },
      { label: "Overtime", value: 38, kind: "hours", delta: "+12h", good: false },
      { label: "Lost jobs (no capacity)", value: 9, kind: "count", delta: "+3", good: false },
    ],
    tabs: [
      { label: "Demand ↔ capacity", panels: [
        { title: "Booked hours vs crew hours (8 wks)", type: "line", wide: true, kind: "hours", keys: ["capacity", "demand"], data: rows(["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], { capacity: [320, 320, 320, 340, 340, 340, 340, 340], demand: [268, 284, 301, 315, 329, 342, 356, 371] }), insight: "Demand crosses capacity in W6 — hire trigger: start onboarding 1 crew now." },
        { title: "Lost jobs by reason", type: "donut", kind: "count", keys: ["v"], data: rows(["No slot", "Too far", "Same-day", "Weekend full"], { v: [4, 2, 2, 1] }) },
      ]},
      { label: "Utilization", panels: [
        { title: "Utilization by crew", type: "hbar", wide: true, kind: "pct", keys: ["util"], data: rows(CREWS, { util: [94, 91, 86, 82, 77] }) },
        { title: "Overtime hours vs 40h", type: "bar", kind: "hours", keys: ["hours"], data: rows(CREWS, { hours: [46, 44, 41, 38, 36] }) },
      ]},
    ],
  },
  crews: {
    title: "Crew analytics",
    kpis: [
      { label: "Avg rating", value: 4.82, kind: "ratio", delta: "+0.04", good: true },
      { label: "On-time", value: 93, kind: "pct", delta: "+2pt", good: true },
      { label: "Complaints", value: 6, kind: "count", delta: "−3", good: true },
      { label: "Earnings / hr", value: 3150, kind: "money", delta: "+$1.20", good: true },
    ],
    tabs: [
      { label: "Quality → revenue", panels: [
        { title: "Rebook rate by crew rating", type: "bar", wide: true, kind: "pct", keys: ["rebook"], data: rows(["< 4.5", "4.5–4.7", "4.7–4.9", "4.9+"], { rebook: [38, 52, 66, 79] }), insight: "Each +0.1 rating ≈ +7pt rebook ≈ $3.1k/mo. Pair Crew E with Crew A for 2 weeks." },
        { title: "Revenue retained by crew", type: "table", kind: "money", keys: ["revenue", "rating"], data: rows(CREWS, { revenue: [1240000, 1110000, 980000, 820000, 610000], rating: [4.94, 4.88, 4.81, 4.72, 4.58] }) },
      ]},
      { label: "Quality trend", panels: [
        { title: "Rating & complaints", type: "line", wide: true, kind: "count", keys: ["complaints", "late"], data: trend(31, 10, 9, ["complaints", "late"], 0.5, -0.04) },
        { title: "Earnings / hr by crew", type: "hbar", kind: "money", keys: ["eph"], data: rows(CREWS, { eph: [3400, 3280, 3150, 2990, 2840] }) },
      ]},
    ],
  },
  invoices: {
    title: "Collections analytics",
    kpis: [
      { label: "Cash this week", value: 1184000, kind: "money", delta: "+7%", good: true },
      { label: "DSO", value: 4.6, kind: "days", delta: "−0.8d", good: true },
      { label: "Overdue", value: 401000, kind: "money", delta: "+$900", good: false },
      { label: "Runway", value: 11.5, kind: "ratio", delta: "+1.2 wk", good: true },
    ],
    tabs: [
      { label: "Cash runway", panels: [
        { title: "Cash in vs burn (weekly)", type: "line", wide: true, kind: "money", keys: ["deposits", "burn"], data: trend(41, 12, 1100000, ["deposits", "burn"], 0.15, 0.012), insight: "Deposits cover burn 1.4×. Collect Commercial net-15 to add 2 weeks of runway." },
        { title: "A/R aging", type: "donut", kind: "money", keys: ["v"], data: rows(["Current", "1–7d", "8–30d", "30d+"], { v: [612000, 241000, 118000, 42000] }) },
      ]},
      { label: "Collections", panels: [
        { title: "Invoiced vs collected", type: "bar", wide: true, kind: "money", keys: ["invoiced", "collected"], data: trend(42, 8, 1200000, ["invoiced", "collected"], 0.1, 0.01) },
        { title: "Payment method", type: "donut", kind: "pct", keys: ["v"], data: rows(["Card", "ACH", "Zelle", "Check"], { v: [58, 21, 17, 4] }) },
      ]},
    ],
  },
  payouts: {
    title: "Payout analytics",
    kpis: [
      { label: "Paid out", value: 2410000, kind: "money", delta: "+9%", good: true },
      { label: "Payout ratio", value: 49.6, kind: "pct", delta: "−0.7pt", good: true },
      { label: "Contractors", value: 14, kind: "count", delta: "+2", good: true },
      { label: "Margin", value: 41.8, kind: "pct", delta: "+2.3pt", good: true },
    ],
    tabs: [
      { label: "Revenue vs payouts", panels: [
        { title: "Revenue vs payouts", type: "line", wide: true, kind: "money", keys: ["revenue", "payouts"], data: trend(51, 12, 1200000, ["revenue", "payouts"], 0.1, 0.01) },
        { title: "Payout split", type: "donut", kind: "money", keys: ["v"], data: rows(CREWS, { v: [610000, 540000, 480000, 430000, 350000] }) },
      ]},
    ],
  },
  growth: {
    title: "Growth OS",
    kpis: [
      { label: "LTV:CAC", value: 5.8, kind: "ratio", delta: "+0.6", good: true },
      { label: "CAC payback", value: 23, kind: "days", delta: "−4d", good: true },
      { label: "90d rebook", value: 64, kind: "pct", delta: "+5pt", good: true },
      { label: "Quote acceptance", value: 47, kind: "pct", delta: "+3pt", good: true },
    ],
    tabs: [
      { label: "Contribution margin", panels: [
        { title: "Contribution margin by channel", type: "hbar", wide: true, kind: "pct", keys: ["cm"], data: rows(CHANNELS, { cm: [31, 38, 52, 49, 24] }), insight: "Yelp CM is 24% — cap spend and move $400/mo to Google LSA." },
        { title: "CM by borough", type: "table", kind: "pct", keys: ["cm", "ltv"], data: rows(BOROUGHS, { cm: [44, 42, 38, 33, 29], ltv: [148000, 131000, 112000, 94000, 81000] }) },
      ]},
      { label: "Retention", panels: [
        { title: "Rebook rate by cohort month", type: "line", wide: true, kind: "pct", keys: ["m1", "m3", "m6"], data: rows(["May", "Jun", "Jul", "Aug", "Sep", "Oct"], { m1: [71, 73, 74, 76, 78, 80], m3: [55, 57, 60, 61, 63, 0], m6: [41, 44, 46, 0, 0, 0] }) },
        { title: "Churn reasons", type: "donut", kind: "count", keys: ["v"], data: rows(["Moved", "Price", "Quality", "DIY", "Unknown"], { v: [14, 11, 7, 5, 9] }), insight: "Win-back SMS returned 4.1× ROI last quarter." },
      ]},
      { label: "Pricing power", panels: [
        { title: "Acceptance by price band", type: "bar", wide: true, kind: "pct", keys: ["accept"], data: rows(["<$150", "$150–250", "$250–400", "$400–600", "$600+"], { accept: [68, 59, 47, 36, 28] }) },
        { title: "Discount leakage", type: "table", kind: "money", keys: ["discounted", "jobs"], data: rows(["First clean", "Recurring", "Move-out", "Commercial"], { discounted: [184000, 92000, 61000, 38000], jobs: [41, 63, 12, 6] }) },
      ]},
    ],
  },
  marketing: {
    title: "Marketing analytics",
    kpis: [
      { label: "Spend", value: 612000, kind: "money", delta: "+4%", good: false },
      { label: "CPL", value: 3820, kind: "money", delta: "−$4.10", good: true },
      { label: "ROAS", value: 6.2, kind: "ratio", delta: "+0.8", good: true },
      { label: "Cost / booked", value: 11200, kind: "money", delta: "−$9", good: true },
    ],
    tabs: [
      { label: "Reach & cost", panels: [
        { title: "CTR / CPC / CPM trend", type: "line", wide: true, kind: "count", keys: ["cpm", "cpc_x10", "ctr_x10"], data: trend(61, 12, 140, ["cpm", "cpc_x10", "ctr_x10"], 0.2, 0.005) },
        { title: "Frequency & reach", type: "table", kind: "count", keys: ["reach", "freq"], data: rows(["Prospecting", "Retargeting", "Lookalike", "Commercial"], { reach: [48200, 9100, 22600, 6400], freq: [1.9, 4.8, 2.3, 3.1] }), insight: "Retargeting freq 4.8 = fatigue. Rotate 2 new creatives." },
        { title: "Spend by daypart", type: "bar", wide: true, kind: "money", keys: ["spend", "booked_value"], data: rows(["6–9a", "9–12", "12–3p", "3–6p", "6–9p", "9p+"], { spend: [62000, 118000, 131000, 124000, 128000, 49000], booked_value: [410000, 920000, 760000, 640000, 880000, 120000] }) },
        { title: "Audience overlap", type: "hbar", kind: "pct", keys: ["overlap"], data: rows(["Prosp ↔ LAL", "Prosp ↔ Retarget", "LAL ↔ Commercial"], { overlap: [34, 12, 8] }) },
      ]},
      { label: "Optimization", panels: [
        { title: "Creative leaderboard (CPL)", type: "hbar", wide: true, kind: "money", keys: ["cpl"], data: rows(["Before/after video", "Crew UGC", "Price card", "Move-out carousel", "Generic stock"], { cpl: [2400, 2900, 3600, 4400, 7900] }), insight: "Kill 'Generic stock' — $410 wasted this period." },
        { title: "Geo ROAS", type: "table", kind: "ratio", keys: ["roas", "spend"], data: rows(BOROUGHS, { roas: [7.9, 6.8, 5.1, 3.2, 2.1], spend: [210000, 180000, 120000, 70000, 32000] }) },
        { title: "Budget pacing", type: "line", wide: true, kind: "money", keys: ["actual", "plan"], data: rows(["W1", "W2", "W3", "W4"], { actual: [148000, 301000, 462000, 612000], plan: [150000, 300000, 450000, 600000] }) },
        { title: "Landing page CVR & A/B", type: "table", kind: "pct", keys: ["cvr", "lift"], data: rows(["Quote form A", "Quote form B ★", "Instant price", "Call-first"], { cvr: [11.2, 14.6, 12.9, 8.1], lift: [0, 30, 15, -28] }) },
      ]},
      { label: "Attribution", panels: [
        { title: "Spend → lead → booked", type: "funnel", wide: true, kind: "count", keys: ["n"], data: rows(["Impressions (00s)", "Clicks", "Leads", "Quoted", "Booked"], { n: [2860, 1940, 160, 98, 55] }) },
        { title: "Booked by attribution window", type: "bar", kind: "count", keys: ["booked"], data: rows(["1d click", "7d click", "28d click", "1d view"], { booked: [31, 48, 55, 9] }) },
        { title: "Campaign / ad set", type: "table", wide: true, kind: "money", keys: ["spend", "leads", "booked"], data: rows(["Deep clean – NYC", "Recurring – BK", "Move-out – QNS", "Office – MAN"], { spend: [228000, 176000, 121000, 87000], leads: [64, 51, 29, 16], booked: [22, 19, 9, 5] }) },
      ]},
    ],
  },
  sales: {
    title: "Sales analytics",
    kpis: [
      { label: "Lead → booked", value: 31.6, kind: "pct", delta: "+2.4pt", good: true, sub: "108 booked of 342 leads" },
      { label: "Speed-to-lead", value: 4.2, kind: "min", delta: "−0.9m", good: true, sub: "78% answered < 5 min" },
      { label: "Close rate", value: 57.4, kind: "pct", delta: "+3.1pt", good: true, sub: "Booked ÷ quoted · win 31.6%" },
      { label: "Revenue / lead", fixed: true, value: 7160, kind: "money", delta: "+$4", good: true, sub: "Cost / booked $112" },
      { label: "Booked this wk", fixed: true, value: 41, kind: "count", delta: "+6", good: true, sub: "37 on books next wk" },
      { label: "Show rate", value: 92.6, kind: "pct", delta: "+1.2pt", good: true, sub: "3.1% no-show · 4.3% resched." },
      { label: "Weighted pipeline", fixed: true, value: 1284000, kind: "money", delta: "+9%", good: true, sub: "$1.85M open · 2.7× target" },
      { label: "Forecast vs target", value: 104, kind: "pct", delta: "+6pt", good: true, sub: "$53.2k of $51.0k" },
    ],
    tabs: [
      { label: "Funnel", panels: [
        { title: "Stage by stage (30d)", type: "funnel", wide: true, kind: "count", keys: ["n"], data: rows(["New lead", "Contacted", "Quoted", "Booked", "Showed", "Paid"], { n: [342, 301, 188, 108, 100, 97] }), insight: "Biggest leak is Contacted → Quoted (62%). Send instant price on first reply." },
        { title: "Step conversion", type: "table", kind: "pct", keys: ["from_prev", "from_lead"], cols: { from_prev: "pct", from_lead: "pct" }, data: rows(["Contacted", "Quoted", "Booked", "Showed", "Paid"], { from_prev: [88, 62.5, 57.4, 92.6, 97], from_lead: [88, 55, 31.6, 29.2, 28.4] }) },
        { title: "Speed-to-lead vs booked rate", type: "bar", wide: true, kind: "pct", keys: ["booked_pct"], data: rows(["< 1 min", "1–5 min", "5–15 min", "15–60 min", "1h+"], { booked_pct: [44, 37, 26, 18, 9] }), insight: "Sub-5-minute replies book 2.4× more. Route after-hours to the Booking bot." },
        { title: "Revenue per lead by source", type: "table", kind: "money", keys: ["leads", "rev_per_lead", "cost_per_booked", "close_pct"], cols: { leads: "count", rev_per_lead: "money", cost_per_booked: "money", close_pct: "pct" }, data: rows(CHANNELS, { leads: [128, 74, 52, 46, 42], rev_per_lead: [5900, 7400, 11800, 8600, 4100], cost_per_booked: [12600, 13400, 0, 0, 19100], close_pct: [27, 38, 61, 44, 22] }) },
      ]},
      { label: "Reps", panels: [
        { title: "Setter / closer leaderboard", type: "table", wide: true, kind: "count", keys: ["dials", "convos", "quotes", "booked", "close", "avg_ticket", "deposit", "discount"], cols: { dials: "count", convos: "count", quotes: "count", booked: "count", close: "pct", avg_ticket: "money", deposit: "pct", discount: "pct" }, data: rows(REPS, { dials: [412, 388, 341, 520, 0], convos: [168, 152, 121, 233, 96], quotes: [62, 55, 41, 44, 38], booked: [31, 24, 17, 22, 14], close: [50, 44, 41, 50, 37], avg_ticket: [24800, 23100, 21900, 20400, 21200], deposit: [81, 74, 69, 92, 88], discount: [4, 7, 9, 2, 3] }), insight: "Booking bot matches Karim's close rate with the best deposit capture (92%)." },
        { title: "Booked by rep", type: "hbar", kind: "count", keys: ["booked"], data: rows(REPS, { booked: [31, 24, 17, 22, 14] }) },
        { title: "Activity: dials, SMS & quotes", type: "bar", wide: true, stacked: true, kind: "count", keys: ["dials", "sms", "quotes"], data: trend(71, 10, 70, ["dials", "sms", "quotes"], 0.25, 0.01) },
        { title: "Win / loss by rep", type: "bar", kind: "count", keys: ["won", "lost"], data: rows(REPS, { won: [31, 24, 17, 22, 14], lost: [31, 31, 24, 22, 24] }) },
      ]},
      { label: "Pipeline", panels: [
        { title: "Forecast vs target", type: "line", wide: true, kind: "money", keys: ["committed", "best_case", "target"], data: trend(72, 8, 1300000, ["committed", "best_case", "target"], 0.1, 0.015) },
        { title: "Stage velocity (median days)", type: "hbar", kind: "days", keys: ["days"], data: rows(["New → contacted", "Contacted → quoted", "Quoted → booked", "Booked → clean", "Clean → paid"], { days: [0.1, 1.4, 2.6, 4.1, 2.2] }) },
        { title: "Stuck > 48h", type: "table", wide: true, kind: "money", keys: ["deals", "value"], cols: { deals: "count", value: "money" }, data: rows(["Quote sent, no reply", "Booked, no deposit", "Contacted, no quote", "Reschedule pending"], { deals: [18, 7, 11, 4], value: [612000, 238000, 264000, 91000] }), insight: "$612k sits in quotes with no reply — follow-up bot at 48h recovers ~22%." },
        { title: "Booking lag & deposit by service", type: "table", kind: "pct", keys: ["lag_days", "deposit"], cols: { lag_days: "days", deposit: "pct" }, data: rows(["Residential", "Recurring", "Move-out", "Commercial"], { lag_days: [3.1, 4.4, 1.9, 9.6], deposit: [84, 71, 93, 40] }) },
        { title: "Appointments: this week vs next", type: "bar", wide: true, kind: "count", keys: ["this_week", "next_week"], data: rows(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], { this_week: [6, 8, 7, 9, 7, 4], next_week: [7, 6, 8, 6, 6, 4] }) },
        { title: "Show outcomes", type: "donut", kind: "pct", keys: ["v"], data: rows(["Showed", "Rescheduled", "No-show", "Cancelled"], { v: [88.2, 4.3, 3.1, 4.4] }) },
      ]},
      { label: "Loss", panels: [
        { title: "Lost revenue by reason", type: "hbar", wide: true, kind: "money", keys: ["lost_revenue"], data: rows(["Price", "No reply", "Timing", "Went w/ competitor", "Out of area"], { lost_revenue: [702000, 545000, 318000, 204000, 136000] }), insight: "Price objections cost $7.0k — test a 3-visit starter pack instead of discounting." },
        { title: "Objection tags", type: "donut", kind: "count", keys: ["v"], data: rows(["Price", "Timing", "Trust", "Spouse", "Scope"], { v: [38, 21, 12, 9, 7] }) },
        { title: "First clean → recurring", type: "line", wide: true, kind: "pct", keys: ["recurring", "rebook_90d"], data: rows(["May", "Jun", "Jul", "Aug", "Sep", "Oct"], { recurring: [34, 36, 39, 41, 43, 46], rebook_90d: [55, 57, 60, 61, 63, 64] }) },
        { title: "Lost deals by stage", type: "table", kind: "count", keys: ["deals", "value"], cols: { deals: "count", value: "money" }, data: rows(["Contacted", "Quoted", "Booked (cancelled)", "No-show"], { deals: [41, 80, 8, 3], value: [492000, 1360000, 182000, 68000] }) },
      ]},
    ],
  },
  dataroom: {
    title: "Agent data room",
    kpis: [
      { label: "Feeds live", value: 16, kind: "count", delta: "+5", good: true },
      { label: "Hours saved", value: 142, kind: "hours", delta: "+22%", good: true },
      { label: "$ influenced", value: 2140000, kind: "money", delta: "+15%", good: true },
      { label: "Escalations", value: 11, kind: "count", delta: "−4", good: true },
    ],
    tabs: [
      { label: "Feeds", panels: [
        { title: "Feed catalog", type: "table", wide: true, kind: "count", keys: ["rows", "readers"], data: rows(["unit_economics", "cash_runway", "demand_capacity", "speed_to_cash", "cohort_retention", "quality_revenue", "ad_attribution", "mkt_reach_cost", "mkt_optimization", "pricing_power", "geo_heat", "sales_activity", "sales_reps_bots", "sales_pipeline", "agent_roi"], { rows: [1240, 365, 560, 980, 720, 410, 2210, 3020, 1880, 640, 310, 1450, 520, 880, 260], readers: [3, 2, 2, 3, 2, 2, 4, 3, 3, 2, 2, 2, 2, 3, 1] }) },
      ]},
      { label: "Agent ROI", panels: [
        { title: "Hours saved by bot", type: "hbar", wide: true, kind: "hours", keys: ["hours"], data: rows(["Booking bot", "Quote bot", "Follow-up bot", "Invoice bot", "Review bot"], { hours: [48, 37, 26, 19, 12] }) },
        { title: "Errors / escalations", type: "table", kind: "count", keys: ["errors", "escalations"], data: rows(["Booking bot", "Quote bot", "Follow-up bot", "Invoice bot", "Review bot"], { errors: [3, 5, 1, 2, 0], escalations: [4, 3, 2, 1, 1] }) },
      ]},
    ],
  },
};
