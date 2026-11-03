import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The sample analytics are invented numbers. Real pages may reach them only
// through DemoAnalytics, which needs DEMO_ANALYTICS=1 and seeded demo rows.
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

describe("sample analytics stay behind demo mode", () => {
  const root = join(process.cwd(), "src");
  const files = walk(root).filter((f) => !f.endsWith(".test.ts"));

  it("only demo-analytics.tsx imports AnalyticsSection", () => {
    const users = files.filter((f) => /analytics\/analytics-section"/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
    expect(users).toEqual(["components/analytics/demo-analytics.tsx"]);
  });

  it("only demo-analytics.tsx and analytics-section.tsx import the packs", () => {
    const users = files.filter((f) => /analytics\/packs"|\.\/packs"/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f)).sort();
    expect(users).toEqual(["components/analytics/analytics-section.tsx", "components/analytics/demo-analytics.tsx"]);
  });

  it("needs the flag and seeded rows", () => {
    const src = readFileSync(join(root, "components/analytics/demo-analytics.tsx"), "utf8");
    expect(src).toContain('process.env.DEMO_ANALYTICS !== "1"');
    expect(src).toContain("5eed0000-");
  });
});
