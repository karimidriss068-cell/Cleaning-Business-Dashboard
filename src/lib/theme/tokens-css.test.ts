import { describe, expect, it } from "vitest";
import { defaultDirection, directionIds, directions, type Palette } from "@/config/brand";
import { fontVar, tokensCss, tokenVar } from "./tokens-css";

const css = tokensCss();
const lines = css.split("\n");

describe("tokensCss", () => {
  it("names variables in kebab case", () => {
    expect(tokenVar("surfaceRaised")).toBe("--kc-surface-raised");
    expect(tokenVar("chart1")).toBe("--kc-chart1");
    expect(tokenVar("accent2")).toBe("--kc-accent2");
  });

  it.each(directionIds)("emits every token of %s for both themes", (id) => {
    const light = lines.find((l) => l.startsWith(`[data-direction="${id}"]`) && l.includes("color-scheme:light")) ?? "";
    const dark = lines.find((l) => l.startsWith(`[data-direction="${id}"].dark`)) ?? "";
    for (const token of Object.keys(directions[id].palettes.dark) as (keyof Palette)[]) {
      expect(light).toContain(`${tokenVar(token)}:${directions[id].palettes.light[token]}`);
      expect(dark).toContain(`${tokenVar(token)}:${directions[id].palettes.dark[token]}`);
    }
    expect(light).toContain("color-scheme:light");
    expect(dark).toContain("color-scheme:dark");
    expect(dark).toContain("--kc-glow:");
  });

  it.each(directionIds)("maps the %s font pairing", (id) => {
    const { display, body } = directions[id].fonts;
    expect(css).toContain(`--font-display:var(${fontVar[display]});--font-body:var(${fontVar[body]})`);
  });

  it("applies the default direction before the attribute is set", () => {
    expect(css).toContain(`:root:not([data-direction]).dark`);
    expect(lines.find((l) => l.includes(":root:not([data-direction]).dark"))).toContain(`[data-direction="${defaultDirection}"]`);
  });

  it("lets a subtree opt into either theme", () => {
    expect(css).toContain(`[data-direction="ocean"] .dark`);
    expect(css).toContain(`[data-direction="ocean"] .light`);
  });

  it("zeroes every duration and the stagger under prefers-reduced-motion", () => {
    const reduced = lines.find((l) => l.startsWith("@media (prefers-reduced-motion:reduce)")) ?? "";
    for (const v of ["fast", "base", "slow", "enter"]) expect(reduced).toContain(`--kc-duration-${v}:0ms`);
    expect(reduced).toContain("--kc-stagger:0ms");
  });

  it("contains no characters that could break out of a <style> tag", () => {
    expect(css).not.toMatch(/<|>/);
  });
});
