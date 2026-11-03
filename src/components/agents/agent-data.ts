/**
 * Agent room sample data. The roster (Atlas, Lumen, Prism, Echo, Quill, Vector,
 * Ledger, Relay) and their desks come from the Agents Vault mock-up in
 * docs/design/agents/index.html. Nothing here reads a real agent runtime yet.
 */
export type AgentStatus = "working" | "waiting" | "idle" | "paused";
export type Agent = {
  id: string;
  name: string;
  role: string;
  desk: "Command" | "Marketing" | "Sales" | "CRM";
  status: AgentStatus;
  task: string;
  lastAction: string;
  tools: string[];
  success: number;
  tasksToday: number;
  hoursSaved: number;
  influencedCents: number;
  errors: number;
  escalations: number;
  spark: number[];
  log: { at: string; text: string }[];
  sops: { name: string; note: string }[];
  ownerMinutes: number;
};

export const AGENTS: Agent[] = [
  { id: "atlas", name: "Atlas", role: "Chief of staff · runs the floor", desk: "Command", status: "working", task: "Building the week 45 plan from goal, cash and open decisions", lastAction: "2m ago", tools: ["GHL", "Calendar", "Stripe", "Supabase"], success: 97, tasksToday: 38, hoursSaved: 31.5, influencedCents: 6120000, errors: 0, escalations: 2, spark: [12, 18, 15, 22, 26, 24, 31, 38], log: [{ at: "8:00 AM", text: "Morning briefing: $61.2k of $65k Nov goal, 94% of pace" }, { at: "8:04 AM", text: "Flagged 2 decisions that need you" }, { at: "9:12 AM", text: "Batched 2 low-risk approvals (saves 6m)" }], sops: [{ name: "Daily briefing", note: "8:00 AM, goal, cash, decisions" }, { name: "Approval batching", note: "Low-risk items grouped" }], ownerMinutes: 54 },
  { id: "lumen", name: "Lumen", role: "Marketing lead", desk: "Marketing", status: "working", task: "Drafting 3 ad variants for the UES move-out test", lastAction: "6m ago", tools: ["Meta", "Canva", "GHL"], success: 91, tasksToday: 14, hoursSaved: 9.4, influencedCents: 1840000, errors: 1, escalations: 1, spark: [4, 6, 5, 9, 8, 11, 10, 14], log: [{ at: "7:40 AM", text: "Pulled CTR on 3 live variants" }, { at: "9:02 AM", text: "Deposit-back guarantee ad drafted" }], sops: [{ name: "Offer test", note: "Hormozi-style offer test won, promote to SOP" }], ownerMinutes: 12 },
  { id: "prism", name: "Prism", role: "Creative & experiments", desk: "Marketing", status: "waiting", task: "Waiting: approve offer test before launch", lastAction: "18m ago", tools: ["Meta", "Canva"], success: 88, tasksToday: 7, hoursSaved: 4.1, influencedCents: 620000, errors: 0, escalations: 1, spark: [3, 2, 4, 5, 4, 6, 5, 7], log: [{ at: "8:51 AM", text: "Asked for approval on deposit-back test" }], sops: [{ name: "Creative rotation", note: "Rotate at frequency 4+" }], ownerMinutes: 6 },
  { id: "echo", name: "Echo", role: "Social & reviews", desk: "Marketing", status: "idle", task: "Scheduled 4 posts; next run 2:00 PM", lastAction: "41m ago", tools: ["Instagram", "Google"], success: 95, tasksToday: 6, hoursSaved: 3.2, influencedCents: 210000, errors: 0, escalations: 0, spark: [2, 3, 3, 4, 3, 5, 4, 6], log: [{ at: "8:30 AM", text: "Scheduled 4 posts" }], sops: [{ name: "Review ask after 2nd clean", note: "Reused 41×, 4.9★ avg" }], ownerMinutes: 0 },
  { id: "quill", name: "Quill", role: "Sales lead · quotes & confirms", desk: "Sales", status: "waiting", task: "Hudson Yards office quote waiting on your OK", lastAction: "4m ago", tools: ["GHL", "SMS", "Calendar", "Stripe"], success: 93, tasksToday: 22, hoursSaved: 12.8, influencedCents: 2380000, errors: 1, escalations: 2, spark: [9, 11, 10, 14, 13, 17, 19, 22], log: [{ at: "8:12 AM", text: "Confirmed 11 cleans for tomorrow, 0 no-shows" }, { at: "9:20 AM", text: "Drafted 3 Midtown office quotes" }], sops: [{ name: "Office quote in 1 call", note: "Reused 22×, +18% close" }], ownerMinutes: 15 },
  { id: "vector", name: "Vector", role: "Speed-to-lead · first reply", desk: "Sales", status: "working", task: "Replying to 23 open Meta/GHL leads (avg 2h)", lastAction: "just now", tools: ["GHL", "SMS", "Voice"], success: 89, tasksToday: 41, hoursSaved: 10.6, influencedCents: 1460000, errors: 2, escalations: 1, spark: [18, 22, 20, 27, 31, 29, 36, 41], log: [{ at: "9:31 AM", text: "Logged 12 calls" }, { at: "9:33 AM", text: "88% of SMS cap, slows at 90%" }], sops: [{ name: "Office quote in 1 call", note: "Shared with Quill" }], ownerMinutes: 4 },
  { id: "ledger", name: "Ledger", role: "CRM, invoices & payouts", desk: "CRM", status: "working", task: "2 completed cleans unbilled ($410), invoicing now", lastAction: "9m ago", tools: ["Stripe", "Supabase", "GHL"], success: 96, tasksToday: 29, hoursSaved: 14.2, influencedCents: 3900000, errors: 0, escalations: 1, spark: [14, 15, 18, 17, 21, 24, 26, 29], log: [{ at: "7:10 AM", text: "Merged 31 duplicate contacts" }, { at: "9:05 AM", text: "Chelsea Lofts at risk: drafted apology + free touch-up" }], sops: [{ name: "Friday payout run", note: "$1.6k cleaner payout" }, { name: "Win-back 3-touch", note: "Shared with Relay, 21% return" }], ownerMinutes: 8 },
  { id: "relay", name: "Relay", role: "Win-back & retention SMS", desk: "CRM", status: "paused", task: "Paused at 500-SMS cap, 14 win-back texts queued", lastAction: "10:42 AM", tools: ["SMS", "GHL", "Email"], success: 84, tasksToday: 11, hoursSaved: 5.7, influencedCents: 940000, errors: 3, escalations: 3, spark: [8, 9, 11, 10, 12, 14, 13, 11], log: [{ at: "10:42 AM", text: "Hit 500 SMS cap, paused itself; nothing sent over cap" }], sops: [{ name: "Win-back 3-touch", note: "Reused 9×, 21% return" }], ownerMinutes: 10 },
];

export const FEED = [
  { at: "10:42", who: "Relay", text: "paused at SMS cap · 14 texts queued", tone: "warning" },
  { at: "9:33", who: "Vector", text: "booked a deep clean from a Meta lead in 3 min", tone: "success" },
  { at: "9:20", who: "Quill", text: "sent 3 Midtown office quotes ($6.4k)", tone: "info" },
  { at: "9:05", who: "Ledger", text: "flagged Chelsea Lofts churn risk ($1,240/mo)", tone: "danger" },
  { at: "9:02", who: "Lumen", text: "drafted deposit-back guarantee ad", tone: "info" },
  { at: "8:30", who: "Echo", text: "scheduled 4 posts", tone: "neutral" },
  { at: "8:12", who: "Quill", text: "confirmed 11 cleans for tomorrow", tone: "success" },
  { at: "8:00", who: "Atlas", text: "posted the morning briefing", tone: "neutral" },
] as const;

export const APPROVALS = [
  { who: "Quill", what: "Hudson Yards office quote · $2,850/mo", risk: "High value", minutes: 8 },
  { who: "Prism", what: "Launch deposit-back offer test · $40/day", risk: "Spend", minutes: 5 },
  { who: "Relay", what: "Raise SMS cap or switch win-back to email", risk: "Guardrail", minutes: 4 },
  { who: "Ledger", what: "Free touch-up for Chelsea Lofts", risk: "Low", minutes: 2 },
];

export const HANDOFFS = [
  { stage: "Lead → reply", owner: "Vector", state: "ok", note: "avg 2h · 23 open" },
  { stage: "Reply → booked", owner: "Quill", state: "ok", note: "11 booked · 0 no-shows" },
  { stage: "Done → invoice", owner: "Ledger", state: "warn", note: "2 unbilled ($410)" },
  { stage: "Invoice → payout", owner: "Ledger", state: "ok", note: "Fri run · $1.6k" },
] as const;

export const GUARDRAILS = [
  { label: "SMS cap", owner: "Relay", state: "tripped", note: "500/500 today, auto-paused" },
  { label: "SMS pace", owner: "Vector", state: "warn", note: "88%, slows at 90%" },
  { label: "Ad spend cap", owner: "Lumen", state: "ok", note: "$412 of $600 this week" },
  { label: "Discount ceiling", owner: "Quill", state: "ok", note: "Max 10%, none over" },
] as const;
