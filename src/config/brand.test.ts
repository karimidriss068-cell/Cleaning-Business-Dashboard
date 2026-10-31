import { describe, expect, it } from "vitest";
import { directionIds, directions, glassLevels, glassSpec, type DirectionId, type Palette, type ThemeName } from "./brand";

// WCAG 2.2 relative luminance and contrast ratio.
function channels(hex: string): number[] {
  return (hex.replace("#", "").match(/../g) ?? []).map((x) => parseInt(x, 16));
}
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** `top` at `alpha` over `bottom`, as an opaque hex (how a glass panel reads). */
function over(top: string, bottom: string, alpha: number): string {
  const t = channels(top);
  const b = channels(bottom);
  return "#" + t.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}
function hue(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: string, b: string) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

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
  ["body text on highlight panel", "text", "highlight", TEXT],
  ["muted text on canvas", "textMuted", "canvas", TEXT],
  ["muted text on surface", "textMuted", "surface", TEXT],
  ["muted text on raised surface", "textMuted", "surfaceRaised", TEXT],
  ["muted text on highlight panel", "textMuted", "highlight", TEXT],
  ["accent text on canvas", "accentText", "canvas", TEXT],
  ["accent text on surface", "accentText", "surface", TEXT],
  ["accent text on raised surface", "accentText", "surfaceRaised", TEXT],
  ["info pill text on info tint", "accentText", "infoSoft", TEXT],
  ["body text on info tint", "text", "infoSoft", TEXT],
  ["muted text on info tint", "textMuted", "infoSoft", TEXT],
  ["muted text on success tint", "textMuted", "successSoft", TEXT],
  ["muted text on warning tint", "textMuted", "warningSoft", TEXT],
  ["muted text on danger tint", "textMuted", "dangerSoft", TEXT],
  ["primary button label", "primaryLabel", "primary", TEXT],
  ["brand accent as icon on surface", "accent", "surface", UI],
  ["second accent on surface", "accent2", "surface", UI],
  ["second accent on raised surface", "accent2", "surfaceRaised", UI],
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

const combos: [DirectionId, ThemeName][] = directionIds.flatMap((d) => (["dark", "light"] as ThemeName[]).map((t) => [d, t] as [DirectionId, ThemeName]));

describe.each(combos)("%s / %s contrast", (direction, theme) => {
  const p = directions[direction].palettes[theme];
  
  it.each(pairs)("%s", (_label, fg, bg, min) => {
    const ratio = contrast(p[fg], p[bg]);
    expect(ratio, `${p[fg]} on ${p[bg]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min + HEADROOM);
  });

  it("keeps text readable on every glass level over the worst-case backdrop", () => {
    // Behind glass can sit the canvas, the aurora blobs at their peak and where they overlap, or
    // another raised surface. Phones and reduced effects only make it more
    // solid (alpha floor), so the normal alpha is the worst case.
    const aurora = glassSpec.aurora[theme];
    const overlap12 = over(p.accent, over(p.accent2, p.canvas, aurora.a2), aurora.a1);
    const overlap123 = over(p.accent, overlap12, aurora.a3);
    const backdrops = [p.canvas, over(p.accent, p.canvas, aurora.a1), over(p.accent2, p.canvas, aurora.a2), over(p.accent, p.canvas, aurora.a3), overlap12, overlap123, p.surfaceRaised, p.highlight];
    const k = glassSpec.brightness[theme];
    const scale = (hex: string) => "#" + channels(hex).map((v) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0")).join("");
    for (const level of glassLevels) {
      for (const behind of backdrops) {
        const backdrop = scale(behind); // the glass dims or lifts what is behind it
        // The sheen lightens the panel: it is the worst case in dark (light text)
        // and absent is the worst case in light (dark text), so test both.
        for (const sheen of [0, glassSpec.sheen[theme]]) {
          const panel = over("#FFFFFF", over(p.surface, backdrop, glassSpec.alpha[theme][level]), sheen);
          for (const [name, fg] of [["text", p.text], ["textMuted", p.textMuted], ["accentText", p.accentText]] as const) {
            expect(contrast(fg, panel), `${level} glass, ${name} ${fg} on ${panel} (behind: ${behind}, sheen ${sheen})`).toBeGreaterThanOrEqual(TEXT + HEADROOM);
          }
        }
      }
    }
  });

  it("keeps text readable on flat tiles (no backdrop filter) over the raw backdrops", () => {
    const aurora = glassSpec.aurora[theme];
    const o12 = over(p.accent, over(p.accent2, p.canvas, aurora.a2), aurora.a1);
    const raw = [p.canvas, o12, over(p.accent, o12, aurora.a3), p.surfaceRaised, p.highlight];
    for (const behind of raw) for (const sheen of [0, glassSpec.sheen[theme]]) {
      const panel = over("#FFFFFF", over(p.surface, behind, glassSpec.flatAlpha[theme]), sheen);
      for (const fg of [p.text, p.textMuted, p.accentText]) expect(contrast(fg, panel), `flat ${fg} on ${panel}`).toBeGreaterThanOrEqual(TEXT + HEADROOM);
    }
  });

  it("keeps crew text at AAA on the solid panel crew screens use", () => {
    expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(AAA);
    expect(contrast(p.crewTextMuted, p.surface)).toBeGreaterThanOrEqual(AAA);
  });

  it("keeps status colors clearly separate from the accents (30 degrees of hue or more)", () => {
    for (const status of [p.successText, p.warningText, p.dangerText]) {
      expect(hueGap(p.accent, status), `accent ${p.accent} vs ${status}`).toBeGreaterThanOrEqual(30);
      expect(hueGap(p.accent2, status), `accent2 ${p.accent2} vs ${status}`).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("palette shape", () => {
  it("defines every token as a 6-digit hex color in every direction and theme", () => {
    for (const [direction, theme] of combos) {
      for (const [token, value] of Object.entries(directions[direction].palettes[theme])) {
        expect(value, `${direction}.${theme}.${token}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it("uses no gold, brass, champagne or yellow outside the warning status", () => {
    for (const [direction, theme] of combos) {
      const p = directions[direction].palettes[theme];
      for (const [token, value] of Object.entries(p)) {
        if (token.startsWith("warning") || token === "chart5") continue;
        const h = hue(value);
        const [r, g, b] = channels(value);
        const saturated = Math.max(r, g, b) - Math.min(r, g, b) > 24;
        expect(saturated && h >= 35 && h <= 65, `${direction}.${theme}.${token} ${value} reads gold/yellow`).toBe(false);
      }
    }
  });
});
