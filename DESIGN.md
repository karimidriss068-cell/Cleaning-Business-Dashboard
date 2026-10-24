# Keystone Clean design system

The design system for the Keystone Clean operations platform: a premium operations cockpit for a high-end cleaning company. The brand name is provisional. It lives only in `src/config/brand.ts`, along with every token in this document; change values there and nowhere else.

Build components from this spec, then apply them. The dev-only `/design` page renders every component in the active direction, dark beside light, and is the visual reference.

**Every screen and component must work in all three directions and both themes.** Use the tokens (section 3) and effects (section 4) only: no hex values, no direction-specific code paths.

## 1. Principles

1. **Dark-first cockpit.** Dark is the primary theme and light is the secondary one. Screens read like instruments: calm, precise and layered, with one signal color.
2. **Two modes, one system.** *Office*: dense, data-rich desktop screens for the owner, admins and staff. *Crew*: large-touch, simple phone screens for subcontractors, at AAA contrast. Both use the same tokens; crew mode changes size and density, not the palette.
3. **Data first.** KPIs are large tabular numerals, money is right-aligned, labels are quiet, and color carries signal or status, never decoration.
4. **Status is never color alone.** Every status shows a text label; pills also carry a dot, and deltas an arrow and a sign.
5. **Depth with intent.** Page content sits on layered surfaces. Glass is only for chrome that floats over the ambient background (sidebar, top bar, palette, drawer, modal, toasts). Radius and elevation differ by role.
6. **Restraint.** Glow appears only on the accent (primary action, active nav indicator, sparkline and chart end points, the brand mark) and on KPI numerals. Motion is short and plays once.

**Not allowed:** gold, brass, champagne or yellow anywhere except the warning status; neon green on black; purple gradients; emoji as icons; one radius and shadow on every card; color-only status; looping animation; leftover copy from the previous product.

## 2. Visual directions (permanent, per user)

There are three permanent visual directions, and each member picks their own. Each direction has a dark palette (primary), a light palette (secondary), a display and body font pairing, and effect values. **The default is Titanium & Ice in dark.**

**Where the choice lives:**
- **Settings → Appearance:** a picker with a live mini Command Center per direction (`AppearancePicker`), plus the theme (dark, light, system).
- **Top bars:** a compact switcher and theme toggle on desktop and phone. Both save to the account.
- **Login and `/design`:** the compact switcher, saving to this browser only.

**How it's stored and resolved:**
- `user_preferences` holds `direction` and `theme`, one row per member with own-row RLS (crew included).
- Order of trust: the saved preference, then the `kc-direction` cookie (a mirror the server reads), then `localStorage`, then the default. If the read fails, the local choice stays. `src/lib/theme/preferences.ts` (`resolveDirection`) is tested.
- The server renders `data-direction` on `<html>` from the cookie, so the first paint is right. `AppearanceSync` applies the saved choice once per page load (for a change made on another device).

**Fonts:**
- Only the selected direction's two families (plus DM Mono) load.
- Fonts don't preload, and the root layout attaches just that direction's font variables (on `<body>`; `<html>`'s class belongs to next-themes). An unreferenced `@font-face` is never downloaded.
- Settings is the only page that loads all six faces, for its previews.

**Previews:** a nested element with `data-direction="…"` takes that direction's tokens. Inside a dark page it gets the dark palette through CSS (`.dark [data-direction]`), with no script.

| | Titanium & Ice | Deep Ocean & Aqua | Midnight & Periwinkle |
|---|---|---|---|
| Mood | Machined steel surfaces, ice-blue signal | Abyssal blues with a bioluminescent aqua edge | Ink-black night with a soft periwinkle glow |
| Canvas / surface / raised | `#0C0F14` / `#131820` / `#1B222C` | `#06121C` / `#0B1C2A` / `#122A3C` | `#0A0B14` / `#11131F` / `#1A1D2E` |
| Text / muted | `#E8EDF3` / `#93A0B1` | `#E4F1F7` / `#8AA5B5` | `#ECEEF8` / `#9499B5` |
| Accent | ice blue `#8EC5FF` | aqua `#3CCFE0` | periwinkle `#8B9CFF` |
| Second accent (quoted leads, chart 2) | lilac `#C4B8FF` | cornflower `#93B6FF` | sky `#74D4F2` |
| Display face | **Sora** | **Unbounded** | **Syne** |
| Body face | Manrope | Figtree | IBM Plex Sans |

The base values above are the owner's, and all of them passed contrast as given. Every derived role (status tints, hairlines, focus rings, sidebar, charts, and each light palette) was fitted to pass, and lives only in `brand.ts`.

## 3. Color roles

The same roles exist in every direction and theme:

| Token | Role |
|---|---|
| `canvas`, `surface`, `surface-raised` | Page, cards and panels, raised rows and controls |
| `highlight` | Accent-tinted callout panel (Needs attention) |
| `text`, `text-muted`, `crew-text-muted` | Body; secondary; crew secondary text (AAA) |
| `accent`, `accent-text`, `accent2` | Signal color (icons, glow, charts); accent as text; second cool hue |
| `primary`, `primary-label` | Primary button fill and label (the accent with a canvas label in dark) |
| `border-subtle`, `border-input`, `hairline` | Solid divider; control boundary (3:1); translucent hairline (10% text) for glass |
| `focus` | Focus ring |
| `info-soft` | Accent tint for info pills |
| `success-*`, `warning-*`, `danger-*` | Status text, tint, fill and label. Green, amber and red, at least 30° of hue from both accents |
| `sidebar-*` | Sidebar text and active state |
| `chart1`–`chart5` | Accent, second accent, steel, success, warning |

**Enforced by `src/config/brand.test.ts` on every run, for every direction × theme (290+ checks):**
- WCAG 2.2 with 0.2 of headroom: 4.5:1 for text, 3:1 for icons, input borders, focus rings and chart series, and 7:1 (AAA) for crew text.
- Text and muted text on glass, blended at each direction's glass opacity.
- A hue gap of at least 30° between each accent and each status color.
- No gold or yellow hue outside the warning tokens.

### Status mapping

| Domain | Status → tone |
|---|---|
| Job | scheduled → info · in progress → info · completed → success · no access → warning · cancelled → neutral |
| Lead stage | new → info · contacted → neutral · quoted → secondary · won → success · lost → neutral |
| Invoice | draft → neutral · open → info · overdue (open, past its NY due date) → danger · paid → success · void → neutral · uncollectible → danger |
| Payout | draft → neutral · approved → info · paid → success · void → neutral |
| Insurance (COI) | valid → success · within 30 days → warning · expired → danger |

`info` is accent text on the info tint. `secondary` is text on the raised surface with an `accent2` ring and dot.

## 4. Effects

| Effect | Utility | Where |
|---|---|---|
| **Ambient backdrop** | `<Ambient />` (`.kc-ambient`) | Behind the app, login and `/design`: a 40px hairline grid plus one soft radial light in the accent, fading out down the page. Static. |
| **Glass** | `glass` | Floating chrome only: sidebar rail, desktop top bar, command palette, drawer, modal, popovers, toasts, sticky table headers. The surface at the direction's glass opacity (72% dark, 78% light) over an 18px blur. Phone bars that content scrolls under are 90–95% opaque instead. |
| **Layered surface** | `surface-layer` | Cards, tiles, kanban cards, table frames: lit slightly from the top (raised into surface). |
| **Hairline** | `border-hairline` | The default border for surfaces and glass (10% of the text color). Controls keep `border-input` for 3:1. |
| **Accent glow** | `glow-accent`, `shadow-[…var(--kc-glow)]` | Primary button hover, active nav indicator, sparkline and chart end points, progress bars, the brand mark. |
| **Number glow** | `text-glow` | KPI numerals only. |

## 5. Typography

Each direction pairs a distinctive display face with a readable body face (section 2), plus DM Mono for ids and codes. All load via `next/font` with `font-display: swap`. Numbers that line up use the `tabular` utility (`tabular-nums lining-nums`); all three display faces have true tabular figures, checked by measurement.

| Step | Office | Crew | Face |
|---|---|---|---|
| `eyebrow` | 11/14, uppercase, +0.16em, accent text | 13/16 | body 600 |
| `display` | 36/40 (32/36 on phones), −0.01em | 34/38 | display 600 |
| `kpi` | 40/44, −0.02em, tabular, number glow | 44/48 | display 500 |
| `h2` | 18/24 | 22/28 | display 500 |
| `body` | 14/20 | 17/24 | body 400 |
| `small` | 13/18 | 15/20 | body 400 |
| `label` | 11/14, uppercase, +0.08–0.12em | 13/16 | body 600 |

## 6. Spacing, radius, elevation

**Spacing:** 4px base, using `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64. Floating chrome is inset 12px from the viewport edge.

**Radius** (different jobs, different corners):

| Token | Value | Used by |
|---|---|---|
| `xs` | 4px | Checkboxes, keyboard hints |
| `sm` | 8px | Buttons, inputs, menu rows, calendar events, banner |
| `md` | 14px | Cards, stat tiles, kanban cards, table frames |
| `lg` | 20px | Sidebar rail, top bar, Needs attention panel, modals, drawers, palette, login card |
| `full` | 9999px | Pills, chips, avatars, toggles, progress bars |

**Elevation:** In dark mode, shadows are deep and soft with a 1px inner top highlight. In light mode they're airy.

| Level | Used by |
|---|---|
| `e0` | Flat (rarely used now; surfaces carry a hairline) |
| `e1` | Tiles, cards, tables, top bar |
| `e2` | Sidebar rail, callout panel, popovers, toasts |
| `e3` | Modal, drawer, palette, login card |

## 7. Motion

| Token | Value | Used by |
|---|---|---|
| `duration-fast` | 140ms | Hover, press, toggles |
| `duration-base` | 220ms | Menus, popovers, tile lift |
| `duration-slow` | 320ms | Drawer, modal, sidebar collapse |
| `--kc-duration-enter` | 620ms | One-time staggered load-in (`kc-enter`, `--i` = position) |
| `--kc-stagger` | 55ms | Delay per item in the load-in |
| `ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | Load-in and drawing |
| `ease-standard` / `ease-exit` | `(0.2, 0, 0, 1)` / `(0.4, 0, 1, 1)` | Moving / leaving |

- **Load-in:** fade plus a 10px rise; on the Command Center it runs from the header through tiles, chart, table and panels.
- **Drawing:** sparklines draw in over 1.1s, staggered with their tile, and the area chart over 1.4s. End points fade in last.
- **No loops.** Nothing loops.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, every duration, delay and stagger is 0ms and everything appears in place.

## 8. Density

Office tables have a comfortable / compact toggle, remembered per browser: rows of 48px or 34px, cells of 12×16px or 6×12px, text at 14px or 13px. Crew mode has no compact setting: tap targets are at least 48×48px, primary actions 56px tall and full width.

## 9. Layout

| Breakpoint | Chrome |
|---|---|
| Phone (< 768px) | Near-opaque top bar (brand, compact direction switcher, search) and a one-handed bottom tab bar (Home, Leads, Schedule, Money, More) with an accent indicator on the active tab; "More" opens a bottom sheet. |
| Tablet (768–1279px) | Floating glass sidebar rail, icons only |
| Desktop (≥ 1280px) | Rail expanded (244px) with **Operate** (Command Center, Leads & Pipeline, Schedule, Crews) and **Business** (Invoices & Payouts, Marketing, Automations, Settings) groups, collapsible and remembered; glass top bar with search (Cmd+K) and the compact appearance controls. |

The demo-data banner ("Demo data loaded, purge before launch") shows under the top bar whenever `5eed0000-` rows exist. Icons are Lucide only, at 18px in navigation and 24px in crew mode, never emoji.

## 10. Components

| Component | Spec |
|---|---|
| **Button** | Primary: accent fill, canvas label, inner top highlight, accent glow on hover. Secondary: raised fill with a hairline. Ghost. Danger. Sizes 28 / 36 / 56px (crew). |
| **Input / Select / Textarea** | 36px tall, `border-input`, canvas fill at 40%, an accent focus halo (4px glow) plus the focus ring. Labels sit above; errors show below with `aria-invalid`. |
| **Table** | Layered frame with a hairline; glass sticky header; hairline rows; density toggle; stacked cards on phones. |
| **Status pill** | Tone tint, tone text, a hairline ring in the tone, and a dot (info dots glow). |
| **Stat tile** | Layered surface, a lit accent hairline on the top edge, a 40px tabular KPI with number glow, a sparkline, and a footer with the delta chip and hint. Lifts 2px on hover when it's a link. |
| **Sparkline / area chart** | Accent line over a gradient fill, drawing in once, ending in a glowing point. The chart adds hairline gridlines, clean ticks (1, 2, 2.5, 5 × 10ⁿ), HTML axis labels and an accessible summary. |
| **Kanban card** | Layered surface, hairline, a stage stripe, lifts on hover. |
| **Calendar event** | Tone tint with a 2px tone edge, sized to its duration, showing 1, 2 or 3 lines by height. The now-line is an accent hairline with a glowing dot. |
| **Empty state** | Icon in a raised ring with a soft glow, display-face title, one sentence, one action. |
| **Command palette** | Glass, `lg` radius, 56px input with an accent caret; the active row shows an accent edge; grouped results; full keyboard support. |
| **Drawer / modal** | Glass over a blurred scrim. Drawer is a right sheet (440px) or a bottom sheet on phones; modal is 480px max, for confirmations. |
| **Toast** | Glass with status tones, above the tab bar on phones. |

## 11. Accessibility

- Contrast as in section 3, enforced by tests; check every new token pair before use.
- A visible focus ring on everything; nothing is reachable only on hover.
- Hit targets at least 24px in office mode and 48px in crew mode, where text is AAA.
- Icon-only buttons have an `aria-label` and a tooltip; status is never color alone; charts have text summaries.
- Respects `prefers-reduced-motion` (no motion at all). The theme defaults to dark, with a manual light/dark/system switch.
- Dates and times show in America/New_York via `src/lib/format.ts`, and money via `formatCents`.
