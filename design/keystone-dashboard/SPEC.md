# Keystone Clean dashboard — shell mock spec

**Rule: match the existing Keystone Clean UI.** This mock replaces the rejected warm-brown "Vault" shell (`design/vault-dashboard/`). It mirrors the live Next app's default look, **Titanium & Ice**, so new screens feel like the product that already ships.

Source of truth: `src/config/brand.ts` (tokens) and `DESIGN.md` (rules). Nothing here overrides them.

## Layout (same as the app)
- **Sidebar** (`src/components/shell/sidebar.tsx`): floating glass panel, 244px, 12px inset, brand lockup, sections **Operate** (Command Center, Leads & Pipeline, Schedule, Crews) and **Business** (Invoices, Payouts, Growth, Roast Room, Marketing, Automations, Settings) from `src/config/navigation.ts`. Active item: raised glass, accent ring, 3px glowing left bar.
- **Top bar**: glass, 56px, ⌘K search, direction switcher, theme, notifications.
- **Content**: max 1400px, 24px padding. `PageHeader` = accent eyebrow + 36px Sora title + muted description + actions.
- **Phone**: sidebar hidden, bottom glass tab bar (Home, Leads, Schedule, Invoices, More), KPIs 2-up, everything else single column, kanban becomes swipeable columns.

## Components
StatTile (lit top edge, 40px Sora tabular numeral with soft glow, signed delta pill with arrow, sparkline with glowing end point), glass cards, data tables (right-aligned money), StatusPill (dot + text, never color alone), progress bars, area/bar charts, lead kanban cards, week calendar events, crew cards.

## Tokens (Titanium & Ice, dark / light)
canvas `#0C0F14`/`#F1F4F8` · surface `#131820`/`#FFFFFF` · raised `#1B222C`/`#F8FAFC` · text `#E8EDF3`/`#0C0F14` · muted `#A0ADBE`/`#595C60` · accent ice `#8EC5FF`/`#6A93BE` · accent2 `#7FE3F0` (chart2 lilac `#C4B8FF`) · success `#4CC38A` · warning `#F0B54A` (only yellow allowed) · danger `#F2777A`.
Type: Sora (display), Manrope (body), DM Mono (codes). Ambient: faint 48px grid + soft ice glow top-right.

## Motion & a11y
Views fade/slide in once (~350ms). No loops. `prefers-reduced-motion` disables all motion. Status always has a text label. Contrast per `brand.test.ts`.

## Open in browser
`shell.html` — bottom-right toggles: Desktop/Phone, Dark/Light. URL params `?view=leads&theme=light&device=phone` also work.

## Analytics layer (v2)
Every screen gets an "analytics" section under its main content: live dot + title, 7d/30d/90d range toggle, clickable KPI filter tiles (toggle on/off, shows "Filtered by … · clear"), and tabbed panels on a 12-col grid (stacks on phone).
Chart kit (inline SVG, no libs): line/area (multi-series, dashed targets, per-day hover hit zones), vertical bars (+ amber overtime stack), donut, half-ring gauge, heatmap (amber ≥92% utilization), horizontal bars, funnel. Shared #tip tooltip on any `[data-tip]`. Insight chips (✦) give one-line recommendations. Motion: line draw-in 1.4s, bars grow 0.8s staggered; all off under prefers-reduced-motion.
- Command: Revenue (res/com vs target, mix, goal pace, borough, margin) · Leads (in vs booked, speed-to-lead) · Crews (team util, quality vs on-time) · Health (cash/pipeline/delivery/reputation gauges + signals)
- Leads: Funnel (+win/loss reasons; source tile filters funnel) · Sources (mix, CPL & close by source, stacked trend) · Response time (median vs goal, day×hour wait heatmap) · Velocity (days per stage, open quoted $)
- Schedule: Utilization (team×day heatmap, fill gauge, hour-by-hour load) · Travel buffer · Overtime (hours vs 40h) · Forecast (demand vs capacity 8 wks)
- Crews: Quality trend + complaints · Utilization · No-show risk + punctuality heatmap · Earnings/hr
- Invoices: A/R aging, payment method, invoiced vs collected · Payouts: revenue vs payouts, split, margin trend · Growth: run-rate vs plan, retention cohorts, CAC/LTV · Marketing: spend vs leads, channel split, creative CPL, borough×channel CPL heatmap

## Growth OS analytics packs (v3)
All Titanium & Ice, fake data, shared 7d/30d/90d range (counts and $ scale with range).

| Pack | Lives in |
|---|---|
| Unit economics (LTV:CAC, payback, CM by channel/borough/crew) | Growth ▸ Contribution margin (+ existing Unit economics tab) |
| Cash runway & collections (cash/wk, DSO, aging risk, burn vs deposits) | Invoices ▸ Cash runway |
| Demand ↔ capacity (booked vs crew hrs, hire trigger, lost jobs) | Schedule ▸ Demand ↔ capacity |
| Speed-to-cash (hop medians, bottlenecks) | Command ▸ Speed-to-cash |
| Cohort retention (rebook by month, churn reasons, win-back ROI) | Growth ▸ Retention (+ Cohorts) |
| Quality → revenue | Crews ▸ Quality → revenue |
| Ad attribution (campaign, window, ad-set funnel) | Marketing ▸ Attribution |
| Marketing reach & cost (CTR/CPC/CPM, freq/reach, overlap, dayparting) | Marketing ▸ Reach & cost |
| Marketing optimization (creative leaderboard, geo ROAS, LP CVR, pacing, wasted spend, A/B) | Marketing ▸ Optimization |
| Pricing power (acceptance by band, discount leakage, ticket mix) | Growth ▸ Pricing power |
| Geo heat (demand/margin/travel by neighborhood) | Command ▸ Geo heat |
| Sales: dials, SMS, connect, talk time, quote volume | Sales ▸ Activity (new nav item) |
| Sales: close/avg ticket/discount/deposit/show by rep & bot, objections, win/loss | Sales ▸ Reps & bots |
| Sales: forecast, coverage, stage aging, booking lag, deposit capture | Sales ▸ Pipeline |
| Agent ROI (hours saved, $ influenced, errors/escalations per bot) | Agent data room ▸ Agent ROI |
| Feed catalog for AI agents (every pack above, location, reader team) | Agent data room ▸ Feeds (new nav item) |

Components added: `tbl()` data table, `EX` tab-extension map merged into `block()`, `V/A.sales`, `V/A.dataroom`, `FEEDS` registry.
