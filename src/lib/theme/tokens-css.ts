import {
  defaultDirection,
  density,
  directionIds,
  directions,
  elevation,
  glassLevels,
  glassSpec,
  motion,
  radius,
  type DirectionId,
  type FontKey,
  type Palette,
  type ThemeName,
} from "@/config/brand";

const kebab = (s: string) => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`).replace(/-(\d)/, "$1");

/** CSS custom property name for a palette token, e.g. surfaceRaised -> --kc-surface-raised. */
export const tokenVar = (token: keyof Palette) => `--kc-${kebab(token)}`;

/** next/font CSS variable for each font key (set on <html> by the root layout). */
export const fontVar: Record<FontKey, string> = {
  sora: "--font-sora",
  manrope: "--font-manrope",
  unbounded: "--font-unbounded",
  figtree: "--font-figtree",
  syne: "--font-syne",
  plexSans: "--font-plex-sans",
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

function glassTokens(direction: DirectionId, theme: ThemeName): string[] {
  const p = directions[direction].palettes[theme];
  const aurora = glassSpec.aurora[theme];
  const out = [
    `--glass-border:color-mix(in oklab,var(--kc-text) ${glassSpec.borderMix[theme] * 100}%,transparent)`,
    `--glass-highlight:${glassSpec.highlight[theme]}`,
    `--kc-glass-a-flat:${glassSpec.flatAlpha[theme]}`,
    `--kc-glass-brightness:${glassSpec.brightness[theme]}`,
    `--glass-sheen:rgb(255 255 255 / ${glassSpec.sheen[theme]})`,
    `--kc-aurora-1:rgb(${rgb(p.accent)} / ${aurora.a1})`,
    `--kc-aurora-2:rgb(${rgb(p.accent2)} / ${aurora.a2})`,
    `--kc-aurora-3:rgb(${rgb(p.accent)} / ${aurora.a3})`,
    `--glass-highlight-side:${glassSpec.highlightSide[theme]}`,
    `--glass-border-hover:color-mix(in oklab,var(--kc-text) ${glassSpec.borderHoverMix[theme] * 100}%,transparent)`,
    `--glass-glow:rgb(${rgb(p.accent)} / ${glassSpec.innerGlow[theme]})`,
  ];
  for (const level of glassLevels) {
    out.push(`--kc-glass-a-${level}:${glassSpec.alpha[theme][level]}`, `--shadow-glass-${level}:${glassSpec.shadow[theme][level]}`);
  }
  return out;
}

function themeBlock(direction: DirectionId, theme: ThemeName): string {
  const d = directions[direction];
  const colors = Object.entries(d.palettes[theme]).map(([k, v]) => `${tokenVar(k as keyof Palette)}:${v}`);
  const shadows = Object.entries(elevation[theme]).map(([k, v]) => `--kc-elevation-${k.slice(1)}:${v}`);
  const fx = d.effects[theme];
  const effects = [`--kc-glow:${fx.glow}`, `--kc-ambient:${fx.ambient}`, `--kc-grid:${fx.grid}`, `--kc-glass-alpha:${fx.glassAlpha}`];
  return [`color-scheme:${theme}`, ...colors, ...shadows, ...effects, ...glassTokens(direction, theme)].join(";");
}

/** Selectors for one direction; the default direction also covers "no attribute yet". */
function scopes(direction: DirectionId): string[] {
  const s = [`[data-direction="${direction}"]`];
  if (direction === defaultDirection) s.push(":root:not([data-direction])");
  return s;
}

/**
 * Every design token from src/config/brand.ts as CSS custom properties,
 * rendered once in the root layout so brand.ts stays the only place values
 * live. Scoping:
 *  - direction: data-direction on <html> (set before paint, see direction.ts)
 *  - theme: .dark / .light on <html> (next-themes) or on any subtree, which
 *    /design uses to show both themes side by side.
 */
export function tokensCss(): string {
  const shared = [
    ...Object.entries(radius).map(([k, v]) => `--kc-radius-${k}:${v}`),
    `--kc-duration-fast:${motion.fast}`,
    `--kc-duration-base:${motion.base}`,
    `--kc-duration-slow:${motion.slow}`,
    `--kc-duration-enter:${motion.enter}`,
    `--kc-stagger:${motion.stagger}`,
    `--kc-ease-standard:${motion.easeStandard}`,
    `--kc-ease-exit:${motion.easeExit}`,
    `--kc-ease-enter:${motion.easeEnter}`,
    ...glassLevels.map((l) => `--kc-glass-blur-${l}:${glassSpec.blur[l]}px`),
    `--kc-glass-floor:0`,
    `--kc-blur-scale:1`,
    `--kc-row-height:${density.comfortable.rowHeight}`,
    `--kc-cell-y:${density.comfortable.cellY}`,
    `--kc-cell-x:${density.comfortable.cellX}`,
    `--kc-cell-font:${density.comfortable.fontSize}`,
  ].join(";");
  const compact = [
    `--kc-row-height:${density.compact.rowHeight}`,
    `--kc-cell-y:${density.compact.cellY}`,
    `--kc-cell-x:${density.compact.cellX}`,
    `--kc-cell-font:${density.compact.fontSize}`,
  ].join(";");

  const lines = [`:root{${shared}}`];
  for (const id of directionIds) {
    const roots = scopes(id);
    const { display, body } = directions[id].fonts;
    // The font variables live on <body> (and on the Settings previews), so
    // map the pairing there too; on <html> alone they'd be undefined.
    lines.push(`${roots.flatMap((r) => [r, `${r} body`]).join(",")}{--font-display:var(${fontVar[display]});--font-body:var(${fontVar[body]})}`);
    // Light is the base; .light opts a subtree back into it inside dark mode.
    lines.push(`${roots.flatMap((r) => [r, `${r} .light`]).join(",")}{${themeBlock(id, "light")}}`);
    // ".dark [data-direction]" lets a nested preview (Settings) follow the
    // page's theme in its own direction without any script.
    lines.push(`${[...roots.flatMap((r) => [`${r}.dark`, `${r} .dark`]), `.dark [data-direction="${id}"]`].join(",")}{${themeBlock(id, "dark")}}`);
  }
  lines.push(`[data-density="compact"]{${compact}}`);
  // Reduced-effects mode: phones get more solid, lightly blurred glass;
  // people who ask for reduced transparency get solid surfaces and no blur.
  lines.push(`@media (max-width:767px){:root{--kc-glass-floor:${glassSpec.phoneFloor};--kc-blur-scale:${glassSpec.phoneBlurScale}}}`);
  lines.push(`@media (prefers-reduced-transparency:reduce){:root{--kc-glass-floor:1;--kc-blur-scale:0}}`);
  lines.push(
    `@media (prefers-reduced-motion:reduce){:root{--kc-duration-fast:0ms;--kc-duration-base:0ms;--kc-duration-slow:0ms;--kc-duration-enter:0ms;--kc-stagger:0ms}}`,
  );
  return lines.join("\n");
}
