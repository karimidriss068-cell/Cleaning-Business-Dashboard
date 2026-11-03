import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADVISORS, ADVISOR_KEYS, AI_LABEL } from "@/lib/board/advisors";
import { advisorSystem } from "@/lib/board/prompt";

// The Roast Room uses our own lenses only: no real people, no portraits, no quotes.
describe("Roast Room stays original", () => {
  it("has the eight original lenses and the AI-approximation label", () => {
    expect(ADVISOR_KEYS).toHaveLength(8);
    expect(ADVISORS).toHaveLength(8);
    expect(AI_LABEL).toMatch(/not real people/i);
    expect(AI_LABEL).toMatch(/no quotes/i);
  });

  it("prompts carry no hot sheets or verbatim-quote permission", () => {
    for (const k of ADVISOR_KEYS) {
      const p = advisorSystem(k);
      expect(p).not.toMatch(/hot.?sheet|verbatim|public teachings/i);
    }
  });

  it("ships no portraits or brains of real people", () => {
    const root = process.cwd();
    expect(existsSync(join(root, "public/board/portraits"))).toBe(false);
    expect(existsSync(join(root, "src/lib/board/brains"))).toBe(false);
  });
});
