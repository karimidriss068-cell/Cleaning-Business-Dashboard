# /agents — Vault "Live Floor" (isometric) spec
Hero: full-height isometric SVG diorama between side columns (stage: top 96px, left 340px, right 380px). Overlays are frosted glass, secondary.

## Scene mapping
- Atlas · CEO: raised platform (z=5) top-right on a pillar; revenue-pace globe hologram; Atlas bot (1.25x).
- Marketing (left): Lumen (lead, working), Prism (waiting), Echo (idle); holograms: ad creative, CTR bars.
- Sales (center): Quill (lead, waiting – quote), Vector (working); holograms: quote $2,480, pipeline funnel.
- CRM (right): Ledger (lead, working), Relay (blocked – SMS quota); holograms: client kanban, win-back bars.
- Dashed light paths Atlas→each wing and wing↔wing; cream "packets" travel paths (animateMotion) = handoffs.
- Ambient: plants, warm lamps, drifting dust particles. Platforms spaced ≥3 iso units apart.

## Layout
Desktop: header (brand, metrics, controls) · left: Atlas briefing (top), live handoffs (bottom) · right: Needs-me-now tray (top), Atlas chat dock (bottom).
Phone (390): header → approvals → briefing → chat → diorama (420px, fitted) → feed.

## Tokens
--bg0 #0B0A09, --bg1 #151311, --bg2 #2B211B, --umber #3a2a20, --cream #F3E9DC, --muted #a89a8a, --tan #A67B5B, --tan2 #c79b78, --warn #d9a441 (blocked only), --bad #c9705a, platform faces --top/--left/--right. Light: cream bg #efe5d8, text #2B211B.
Spacing 4/8/12/16/24/32/48. Type: 11 label caps (.08em), 13 body-s, 15 body, 24 metric, 28 briefing figure. Radius 18 panels, 14 cards, 12 buttons.

## States (bot base glow + eye/antenna color)
working #c79b78 pulse 2.4s · waiting #e8d6b8 breathe 5s · blocked #d9a441 static · idle #8f8274 · paused #5d544c (global kill = grayscale stage).

## Motion
ease cubic-bezier(.22,1,.36,1); numbers roll 1.6s easeOutQuart; feed slide-in .8s; bots bob 3px/3s; holograms shimmer 4s; paths flow 3s. Focus dims other wings to .25 over .8s. prefers-reduced-motion: all animation off, packets hidden.

## Accessibility
Text ≥4.5:1 on both themes; each bot has <title> with name/state/task; feed + tray aria-live; Kill guarded by <dialog>; ⌘K focuses Atlas chat; visible focus rings (tan2).

## v4 · Operating features (added)
Floor stays hero; new features live in (a) a slim Lead→Payout strip above the floor, (b) a left Ops drawer (tabs, 600px, opaque glass, slides 0.7s) opened by `Ops ▸`, `Alerts`, or clicking floor tags, (c) minute chips on approvals.
1. **Cadence** — Mon Plan / Fri Review toggle: goal pace, cash + runway, team commitments, open decisions, "Lock week plan"; Fri: scored hits/misses + carry-forward.
2. **Guardrails** — per-team caps (spend/SMS/outbound) with bars. Rule: ≥90% → slow (warn bar), 100% → auto-pause bot + one alert, never exceeds cap without owner. Relay shows on-floor shield tag "CAP HIT · 500 SMS · auto-paused" (click → Guardrails); approval card offers Raise/Switch/Hold.
3. **Owner hours** — header metric "x / 15h"; tray header shows total minutes pending + bar; each card "costs you Xm"; batch low-risk shows minutes saved; Hours tab: ring, breakdown, next batch window.
4. **Experiment → SOP** — winning test card → "Promote to SOP" adds playbook card with reuse count + bots reusing it.
5. **Lead → job → payout** — strip: Leads → Booked → Done → Invoiced → Payout; gaps show owning bot; leaks in warn color; animated dots (hidden in reduced motion). Detail tab table.
6. **Exception alerts** — Quiet mode (default on): only blocked / overspend forecast / churn risk; badge = 3 (50 when off); routine events collapsed.
7. **Capacity** — pipeline h vs crew h; Atlas hire proposal with $ math (30h × $24 = $720/wk → +$840/wk margin), next trigger (coordinator), fire/cut signal.
8. **Client health** — scored at-risk table (score bar, reason, owning-bot action) + win-back queue tied to Relay/Ledger.
Phone: strip wraps (gap labels hidden), Ops drawer becomes static section after approvals with horizontally scrolling tabs.
URL params for shots: `?light=1`, `?phone=1`, `?ops=cad|grd|hrs|sop|alr|cap|cli|loopd`.

- **Spacing (v5):** platforms sit ≥5 iso units apart, holograms ≥120px apart on screen, overlays keep ≥20px clear of the floor (stage inset 360/400px, top 206px), chat collapses to a bar, Ops is an icon until opened.
