# Keystone Clean · Vault Dashboard Shell — Spec
## Layout
- Desktop: 248px sticky sidebar (grouped: Operate / Money / Grow+AI / Settings) + main (max 1440px, padding 32/48/64).
- Header: greeting/title + one-line "what needs you · est. minutes", range segment, ⌘K Ask Atlas, primary "+ New job".
- Phone (390): no sidebar; bottom tab bar (Home, Leads, Schedule, Money, Agents); grids collapse to 1 col (KPIs 2-up); kanban becomes horizontal snap scroll.
## Screens
Command Center (4 KPIs, Atlas briefing + goal ring, Needs-you approvals, today schedule, week density, AI teams) · Leads & Pipeline (KPIs + 5-stage kanban) · Schedule (week grid 8–16h × Mon–Sat, capacity, open slots) · Crews (crew cards, status, quality) · Invoices (KPIs + table w/ status pills) · Payouts (Friday batch table, labor %, approve) · Growth (12-mo area chart, recurring/LTV/churn) · Marketing (spend/CPL/ROAS/reviews + experiments) · Agents (orb summary, spend, hours saved, guarded kill switch, link to `../agents-vault/agents.html`) · Roast Room (entry + board lineup + verdicts) · Automations & Settings (toggles + guardrails).
## Spacing scale
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 (`--s1`…`--s8`). Card padding 24, grid gap 24, section gap 48. Radius 20 (cards), 14 (lead cards), 12 (buttons).
## Type scale
KPI 38/600 (phone 28) · Page title 30/600 (phone 24) · Briefing 20 · Body 15/1.55 · Small 13 · Label 13 uppercase +.06em · Micro 11–12. Tabular numerals on money.
## Colors (CSS vars)
Dark: --bg #0B0A09, --bg2 #1a1410, --panel rgba(43,33,27,.55), --panel-solid #151311, --line rgba(236,224,207,.10), --text #F2E9DC, --muted #B9AC9C, --accent #A67B5B, --ok #8FB59A, --warn #D9B45A (warning only), --bad #D08A7A.
Light: --bg #F5EEE4, --bg2 #EADFCF, --panel rgba(255,251,245,.72), --text #231A14, --muted #5E5046, --accent #8A5F41, --ok #3E7A52, --warn #8A6A12, --bad #9A4636.
## Motion
Ease cubic-bezier(.22,1,.36,1). View change: 600ms fade+8px rise. Numbers roll 1.2s ease-out-quart. Bars fill 1.2s. Agent orbs breathe 4s (working 2s, blocked static + desaturated). No spin/jitter/3D. `prefers-reduced-motion`: all animation/transition off, numbers render final.
## Accessibility
Text ≥4.5:1 on both themes (cream on espresso, umber on cream); status always text + color; focus-visible 2px accent ring; nav is `<nav aria-label>`; tables use th; kill switch requires confirm dialog in build.
