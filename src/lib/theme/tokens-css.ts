import { density, elevation, motion, palettes, radius, type Palette, type ThemeName } from "@/config/brand";

const kebab = (s: string) => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`).replace(/-(\d)/, "$1");

/** CSS custom property name for a palette token, e.g. surfaceRaised -> --kc-surface-raised. */
export const tokenVar = (token: keyof Palette) => `--kc-${kebab(token)}`;

function themeBlock(theme: ThemeName): string {
  const colors = Object.entries(palettes[theme]).map(([k, v]) => `${tokenVar(k as keyof Palette)}:${v}`);
  const shadows = Object.entries(elevation[theme]).map(([k, v]) => `--kc-elevation-${k.slice(1)}:${v}`);
  return [...colors, ...shadows].join(";");
}

/**
 * Every design token from src/config/brand.ts as CSS custom properties.
 * Rendered once in the root layout, so brand.ts stays the only place values
 * live; globals.css only maps names onto these variables.
 *
 * Light applies on :root and .light, dark on .dark (next-themes sets the class
 * on <html>; any subtree can also opt into a theme, which /design uses).
 */
export function tokensCss(): string {
  const shared = [
    ...Object.entries(radius).map(([k, v]) => `--kc-radius-${k}:${v}`),
    `--kc-duration-fast:${motion.fast}`,
    `--kc-duration-base:${motion.base}`,
    `--kc-duration-slow:${motion.slow}`,
    `--kc-ease-standard:${motion.easeStandard}`,
    `--kc-ease-exit:${motion.easeExit}`,
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
  return [
    `:root{${shared}}`,
    `:root,.light{color-scheme:light;${themeBlock("light")}}`,
    `.dark{color-scheme:dark;${themeBlock("dark")}}`,
    `[data-density="compact"]{${compact}}`,
    `@media (prefers-reduced-motion:reduce){:root{--kc-duration-fast:0ms;--kc-duration-base:0ms;--kc-duration-slow:0ms}}`,
  ].join("\n");
}
