# Keystone Clean design system

The design system for the Keystone Clean operations platform. The brand name is provisional; it lives only in `src/config/brand.ts`, along with every token in this document. Change it there and nowhere else.

Build components from this spec, then apply them. The dev-only `/design` page renders every component in both themes and is the visual reference.

## 1. Principles

1. **Two modes, one system.** *Office*: dense, data-rich desktop screens for owner, admin and staff. *Crew*: large-touch, simple phone screens for subcontractors. Both use the same tokens; crew mode changes size and density, not the palette.
2. **Data first.** Numbers are tabular and right-aligned, labels are quiet, and color carries status, not decoration.
3. **Status is never color alone.** Every status shows a text label, and pills also carry a dot.
4. **Calm surfaces, deliberate depth.** Cards don't all share one radius and shadow. Depth signals what floats (menus, drawers, modals) and what is page (flat, bordered).
5. **Motion explains, never decorates.** Short, subtle transitions; none at all under `prefers-reduced-motion`.

**Not allowed:** purple or rainbow gradients, glassmorphism, emoji as icons, a single radius/shadow on every card, color-only status, grain or 3D backgrounds, and leftover copy from the previous product.

## 2. Color: the Harbor palette

Base colors: navy `#0F2A3D`, teal `#1F9D9A`, mist `#EAF2F3`, sand `#E9E2D6`. Teal fails as text (3.31:1 on white), so it's the brand color for icons, charts, large headings and focus. Text and buttons use same-hue shades that pass.

Every pair below was checked against WCAG 2.2 with at least 0.2 of headroom: 4.5:1 for text, 3:1 for icons, input borders and focus rings, and 7:1 (AAA) for crew-mode text, since crews read outdoors. `src/config/brand.test.ts` enforces all 86 pairs (43 per theme) on every test run.

| Token | Role | Light | Dark |
|---|---|---|---|
| `canvas` | Page background | `#EAF2F3` | `#0A1C29` |
| `surface` | Cards, tables, panels | `#FFFFFF` | `#0F2A3D` |
| `surface-muted` / `surface-raised` | Table headers, hover rows, raised panels | `#F6F9FA` | `#163852` |
| `sand` | Warm highlight surface (today, callouts) | `#E9E2D6` | `#2B2A26` |
| `text` | Body text | `#0F2A3D` | `#EAF2F3` |
| `text-muted` | Secondary text, labels | `#506573` | `#95A4AC` |
| `crew-text-muted` | Secondary text in crew mode (AAA) | `#324A5A` | `#AAB8BE` |
| `accent` | Brand teal: icons, charts, large headings | `#1F9D9A` | `#1F9D9A` |
| `accent-text` | Teal text and links | `#186C72` | `#4CB0AE` |
| `primary` / `primary-label` | Primary button fill / label | `#1B8083` / `#FFFFFF` | `#5CB7B5` / `#0F2A3D` |
| `border-subtle` | Dividers, card outlines (decorative) | `#D4DEE1` | `#294253` |
| `border-input` | Input and control boundaries | `#768893` | `#748691` |
| `focus` | Focus ring | `#1C8A8B` | `#1F9D9A` |
| `info-soft` | Info pill tint (with `accent-text`) | `#E4F3F3` | `#113A4A` |
| `success-text` / `-soft` / `-fill` | Success | `#247856` / `#E6F3EC` / `#247856` | `#6EBB93` / `#143B43` / `#6EBB93` |
| `warning-text` / `-soft` / `-fill` | Warning | `#7D692B` / `#FBF4E4` / `#E0A21B` | `#E1A82A` / `#283839` / `#E0A21B` |
| `danger-text` / `-soft` / `-fill` | Danger | `#B54144` / `#FAE9E9` / `#B54144` | `#DE8A8B` / `#3B303F` / `#DE8A8B` |

Labels on fills: white on success and danger fills in light mode; navy on every fill in dark mode; navy on the warning fill in both modes. Real amber can't carry white text, so light-mode warning text is olive (`#7D692B`), while bright amber `#E0A21B` stays for badges with a navy label.

**Sidebar:** navy in both modes (light `#0F2A3D`, dark `#0A1C29` with a `border-subtle` edge). Items use mist text; the active item uses `#4CB0AE` (5.73:1 on navy).

**Charts:** every series reaches 3:1 against the surface it's drawn on.

| Series | Light | Dark |
|---|---|---|
| 1 | teal `#1F9D9A` (3.31) | teal `#1F9D9A` (4.47) |
| 2 | harbor blue `#3A6F95` (5.40) | `#7FA6C4` (5.75) |
| 3 | driftwood `#8A7656` (4.37) | `#C4B394` (7.20) |
| 4, 5 | `success-fill`, `warning-text` | `success-text`, `warning-text` |

Charts always have direct labels or a legend; never rely on hue alone.

### Status mapping

| Domain | Status → pill tone |
|---|---|
| Job | scheduled → info · in progress → info (filled dot) · completed → success · no access → warning · cancelled → neutral |
| Lead stage | new → info · contacted → neutral · quoted → sand · won → success · lost → neutral (muted) |
| Invoice | draft → neutral · open → info · overdue (open, past due) → danger · paid → success · void → neutral · uncollectible → danger |
| Payout | draft → neutral · approved → info · paid → success · void → neutral |
| Insurance (COI) | valid → success · expires within 30 days → warning · expired → danger |

`info` uses `accent-text` on a teal tint. `sand` uses `text` on `sand`.

## 3. Typography

| Family | Use | Source |
|---|---|---|
| **Mohave** | Page titles, section headers, KPI numerals, the wordmark | Google Fonts, `font-display: swap` |
| **DM Sans** | Everything else: body, tables, forms, buttons | Google Fonts, `font-display: swap` |
| **DM Mono** | Ids, invoice numbers, codes | Google Fonts, `font-display: swap` |

Numbers in tables, stat tiles and money columns use **tabular figures** (`font-variant-numeric: tabular-nums`, the `.tabular` utility), and money is right-aligned.

| Step | Office | Crew | Font / weight |
|---|---|---|---|
| `display` | 28/32 | 30/34 | Mohave 600 |
| `kpi` | 32/36 | 36/40 | Mohave 500, tabular |
| `h2` | 20/24 | 22/28 | Mohave 600 |
| `h3` | 15/20 | 18/24 | DM Sans 600 |
| `body` | 14/20 | 17/24 | DM Sans 400 |
| `small` | 13/18 | 15/20 | DM Sans 400 |
| `label` | 11/14, uppercase, +0.06em | 13/16 | DM Sans 600 |

## 4. Spacing

4px base. Use only these steps: `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64. Office pages use a 24px gutter on desktop and 16px on phones. Crew screens use 16px gutters and 12px gaps between cards.

## 5. Radius

Different jobs, different corners. Not everything is rounded the same.

| Token | Value | Used by |
|---|---|---|
| `radius-none` | 0 | Table cells, the sidebar, full-bleed bars |
| `radius-xs` | 4px | Checkboxes, kanban status stripes, calendar events |
| `radius-sm` | 6px | Buttons, inputs, selects, menus |
| `radius-md` | 10px | Office cards, stat tiles, kanban cards |
| `radius-lg` | 16px | Modals, drawers, crew job cards, the command palette |
| `radius-full` | 9999px | Pills, avatars, the density toggle |

## 6. Elevation

Navy-tinted shadows (`rgb(15 42 61 / α)`), lighter than they look on paper. In dark mode depth comes mostly from surface lightness (`surface` → `surface-raised`), so the shadows are subtler.

| Level | Token | Used by | Light | Dark |
|---|---|---|---|---|
| 0 | `elevation-0` | Page content: tables, office cards | border only | border only |
| 1 | `elevation-1` | Stat tiles, kanban cards, crew cards | `0 1px 2px α.06, 0 1px 1px α.04` | `0 1px 2px rgb(0 0 0 / .3)` |
| 2 | `elevation-2` | Menus, popovers, toasts, the command palette | `0 8px 24px α.12, 0 2px 6px α.06` | `0 8px 24px rgb(0 0 0 / .45)` |
| 3 | `elevation-3` | Modals, drawers | `0 24px 48px α.18, 0 4px 12px α.08` | `0 24px 48px rgb(0 0 0 / .55)` |

## 7. Motion

| Token | Value | Used by |
|---|---|---|
| `duration-fast` | 120ms | Hover, press, toggles |
| `duration-base` | 180ms | Menus, popovers, toasts, the command palette |
| `duration-slow` | 240ms | Drawers, modals, sidebar collapse |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Entering and moving |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving |

Transitions animate opacity and short translations (≤ 8px), and no animation ever loops. Under `prefers-reduced-motion: reduce`, every duration becomes 0ms and translations are removed: content appears in place.

## 8. Density

Office tables have a **density toggle** (comfortable / compact), remembered per browser:

| | Comfortable | Compact |
|---|---|---|
| Row height | 44px | 32px |
| Cell padding | 12px × 16px | 6px × 12px |
| Body size | 14px | 13px |

Crew mode has no compact setting: tap targets are at least 48 × 48px, primary actions 56px tall and full width, and controls sit in the bottom half of the screen.

## 9. Layout

| Breakpoint | Navigation |
|---|---|
| Phone (< 768px) | Bottom tab bar, one-handed: **Home, Schedule, Leads, Money, More**. Labels always visible, 64px tall plus the safe-area inset. "More" opens a bottom sheet with Crews, Marketing, Automations, Settings, the theme switch and sign out. |
| Tablet (768–1279px) | Slim sidebar collapsed to icons (64px), with tooltips |
| Desktop (≥ 1280px) | Sidebar expanded (232px), collapsible to icons; the choice is remembered |

Sidebar order: **Command Center, Leads & Pipeline, Schedule, Crews, Invoices & Payouts, Marketing, Automations, Settings**. The brand mark sits at the top and the collapse control at the bottom. **Cmd+K / Ctrl+K** opens the command palette from anywhere.

The demo-data banner ("Demo data loaded, purge before launch") spans the top of the content area whenever rows with the `5eed0000-` id prefix exist. It uses the warning soft background and can't be dismissed.

Icons: Lucide only, 16px in office (20px in navigation), 24px in crew mode. Never emoji.

## 10. Components

| Component | Spec |
|---|---|
| **Button** | Variants: primary (filled), secondary (`surface` + `border-input`), ghost, danger. Sizes sm 28px, md 36px, crew 56px. Visible focus ring: 2px `focus` with a 2px offset. While loading, the label stays and a spinner is added. |
| **Input / Textarea** | 36px tall, `radius-sm`, `border-input`, `surface` fill. Errors show `danger-text` below the field plus `aria-invalid`. Labels always sit above the field, never as placeholder-only. |
| **Select** | Same frame as Input; the menu uses `elevation-2`. |
| **Table** | Flat (`elevation-0`) with a sticky header on `surface-muted`, `label`-style headings, a density toggle, tabular right-aligned numbers, and row hover on `surface-muted`. On phones, tables become stacked cards. |
| **Status pill** | `radius-full`, a soft tone background, tone text and a 6px dot. Always a text label. |
| **Kanban card** | `radius-md`, `elevation-1`, with a 3px stage stripe on the left (`radius-xs`). Shows name, service, value (tabular), age and source. Draggable cards show a grab handle on hover. |
| **Calendar event** | `radius-xs`, a tone tint with a left border in the tone color. Shows time (tabular), client and crew. Height scales with duration and is never shorter than 32px. |
| **Stat tile** | `radius-md`, `elevation-1`. Shows a `label`, a `kpi` value, a delta with an arrow and a text sign (never color-only), and a sparkline. |
| **Sparkline** | Inline SVG, 1.5px `accent` stroke, a 10% fill under the line, and a dot on the last point. `aria-hidden`; the tile's text carries the meaning. |
| **Empty state** | A 40px Lucide icon in a mist circle, an `h3` title, a one-sentence body and at most one action. |
| **Toast** | `elevation-2`, `radius-sm`, bottom-right on desktop and above the tab bar on phones. Success, error and info tones; it auto-dismisses after 5s unless it has an action. |
| **Command palette** | `radius-lg`, `elevation-2`, centered at 20vh, 560px wide (full width on phones). Groups: Go to, Create, Recent. Keyboard: ↑ ↓ to move, Enter to open, Esc to close. |
| **Drawer** | Right side sheet, 440px wide on desktop and a bottom sheet on phones. `radius-lg` on the inner edge, `elevation-3`, slide plus fade over `duration-slow`. |
| **Modal** | Centered, max 480px, `radius-lg`, `elevation-3`. For confirmations and short forms only; long forms go in drawers. |

## 11. Accessibility

- Contrast as in section 2; every new token pair is checked before use.
- Visible focus on every interactive element; nothing is reachable only on hover.
- Hit targets at least 24px in office mode and 48px in crew mode.
- Every icon-only button has an `aria-label` and a tooltip. Status is never color alone.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`, with a manual theme switch in the shell.
- Dates and times are shown in America/New_York via `src/lib/format.ts`, and money via `formatCents`.
