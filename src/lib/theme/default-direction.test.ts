import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultDirection } from "@/config/brand";

// The database default and the code default must name the same direction, or a new
// member would see one look on the server render and another after their row loads.
describe("default direction", () => {
  it("is Glass Cyan", () => {
    expect(defaultDirection).toBe("glass-cyan-dark");
  });

  it("matches the database default on user_preferences.direction", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const re = /alter column direction set default '([a-z-]+)'/g;
    let last: string | null = null;
    for (const f of readdirSync(dir).sort()) {
      for (const m of readFileSync(join(dir, f), "utf8").matchAll(re)) last = m[1];
    }
    expect(last).toBe(defaultDirection);
  });
});
