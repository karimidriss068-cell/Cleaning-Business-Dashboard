import { describe, expect, it } from "vitest";
import { palettes, type Palette } from "@/config/brand";
import { tokensCss, tokenVar } from "./tokens-css";

const css = tokensCss();
const block = (selector: string) => css.split("\n").find((l) => l.startsWith(`${selector}{`)) ?? "";

describe("tokensCss", () => {
  it("names variables in kebab case", () => {
    expect(tokenVar("surfaceRaised")).toBe("--kc-surface-raised");
    expect(tokenVar("chart1")).toBe("--kc-chart1");
    expect(tokenVar("sidebarActiveBg")).toBe("--kc-sidebar-active-bg");
  });

  it("emits every palette token for both themes with the brand.ts value", () => {
    const light = block(":root,.light");
    const dark = block(".dark");
    for (const token of Object.keys(palettes.light) as (keyof Palette)[]) {
      expect(light).toContain(`${tokenVar(token)}:${palettes.light[token]}`);
      expect(dark).toContain(`${tokenVar(token)}:${palettes.dark[token]}`);
    }
  });

  it("sets color-scheme per theme so native controls match", () => {
    expect(block(":root,.light")).toContain("color-scheme:light");
    expect(block(".dark")).toContain("color-scheme:dark");
  });

  it("emits radius, elevation, motion and density scales", () => {
    expect(css).toContain("--kc-radius-md:10px");
    expect(css).toContain("--kc-elevation-3:");
    expect(css).toContain("--kc-duration-slow:240ms");
    expect(block('[data-density="compact"]')).toContain("--kc-row-height:32px");
  });

  it("zeroes every duration under prefers-reduced-motion", () => {
    const reduced = css.split("\n").find((l) => l.startsWith("@media (prefers-reduced-motion:reduce)")) ?? "";
    for (const d of ["fast", "base", "slow"]) expect(reduced).toContain(`--kc-duration-${d}:0ms`);
  });

  it("contains no characters that could break out of a <style> tag", () => {
    expect(css).not.toMatch(/<|>/);
  });
});
