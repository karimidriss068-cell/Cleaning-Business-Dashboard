import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Sign-in is the only way into the dashboard. Nothing may let an environment
// variable switch it off or mint a session for a visitor, in any environment.
const ROOT = join(process.cwd(), "src");
const SELF = "lib/auth-bypass.test.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT).filter((f) => relative(ROOT, f) !== SELF);

describe("no environment-based auth bypass", () => {
  it("has no bypass-style env switch", () => {
    const bad = /process\.env\.[A-Z_]*(OPEN_ACCESS|AUTH_BYPASS|BYPASS_AUTH|SKIP_AUTH|DISABLE_AUTH|NO_AUTH|AUTO_LOGIN|AUTOLOGIN|FAKE_AUTH|DEV_LOGIN)[A-Z_]*/;
    const hits = files.filter((f) => bad.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  it("never mints a session outside sign-in (generateLink, createSession, signInWithOtp via admin)", () => {
    const bad = /auth\.admin\.(generateLink|createSession)|verifyOtp\(/;
    const hits = files.filter((f) => bad.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  it("has no route that signs visitors in", () => {
    const hits = files.map((f) => relative(ROOT, f)).filter((f) => /open-access|auto-login|dev-login/.test(f));
    expect(hits).toEqual([]);
  });
});
