import { describe, expect, it } from "vitest";
import { palettes, type Palette, type ThemeName } from "./brand";

// WCAG 2.2 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = (hex.replace("#", "").match(/../g) ?? []).map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every pair must clear its WCAG minimum by this much (DESIGN.md section 2).
const HEADROOM = 0.2;
const TEXT = 4.5;
const UI = 3;
const AAA = 7;

type Pair = [label: string, fg: keyof Palette, bg: keyof Palette, min: number];

const pairs: Pair[] = [
  ["body text on canvas", "text", "canvas", TEXT],
  ["body text on surface", "text", "surface", TEXT],
  ["body text on raised surface", "text", "surfaceRaised", TEXT],
  ["body text on sand", "text", "sand", TEXT],
  ["muted text on canvas", "textMuted", "canvas", TEXT],
  ["muted text on surface", "textMuted", "surface", TEXT],
  ["muted text on raised surface", "textMuted", "surfaceRaised", TEXT],
  ["muted text on sand", "textMuted", "sand", TEXT],
  ["teal text on canvas", "accentText", "canvas", TEXT],
  ["teal text on surface", "accentText", "surface", TEXT],
  ["teal text on sand", "accentText", "sand", TEXT],
  ["info pill text on info tint", "accentText", "infoSoft", TEXT],
  ["primary button label", "primaryLabel", "primary", TEXT],
  ["brand teal icon on surface", "accent", "surface", UI],
  ["input border on surface", "borderInput", "surface", UI],
  ["input border on canvas", "borderInput", "canvas", UI],
  ["focus ring on canvas", "focus", "canvas", UI],
  ["focus ring on surface", "focus", "surface", UI],
  ["success text on surface", "successText", "surface", TEXT],
  ["success text on success tint", "successText", "successSoft", TEXT],
  ["success fill label", "successLabel", "successFill", TEXT],
  ["warning text on surface", "warningText", "surface", TEXT],
  ["warning text on warning tint", "warningText", "warningSoft", TEXT],
  ["warning fill label", "warningLabel", "warningFill", TEXT],
  ["danger text on surface", "dangerText", "surface", TEXT],
  ["danger text on danger tint", "dangerText", "dangerSoft", TEXT],
  ["danger fill label", "dangerLabel", "dangerFill", TEXT],
  ["sidebar text", "sidebarText", "sidebar", TEXT],
  ["sidebar muted text", "sidebarTextMuted", "sidebar", TEXT],
  ["sidebar active text on active background", "sidebarActiveText", "sidebarActiveBg", TEXT],
  ["sidebar focus ring", "focus", "sidebar", UI],
  ["chart series 1 on surface", "chart1", "surface", UI],
  ["chart series 2 on surface", "chart2", "surface", UI],
  ["chart series 3 on surface", "chart3", "surface", UI],
  ["chart series 4 on surface", "chart4", "surface", UI],
  ["chart series 5 on surface", "chart5", "surface", UI],
  ["crew body text on surface (AAA)", "text", "surface", AAA],
  ["crew muted text on surface (AAA)", "crewTextMuted", "surface", AAA],
];

describe.each(["light", "dark"] as ThemeName[])("%s palette contrast", (theme) => {
  it.each(pairs)("%s", (_label, fg, bg, min) => {
    const ratio = contrast(palettes[theme][fg], palettes[theme][bg]);
    expect(ratio, `${palettes[theme][fg]} on ${palettes[theme][bg]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min + HEADROOM);
  });
});

describe("palette shape", () => {
  it("defines every token as a 6-digit hex color in both themes", () => {
    for (const theme of ["light", "dark"] as ThemeName[]) {
      for (const [token, value] of Object.entries(palettes[theme])) {
        expect(value, `${theme}.${token}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
});
