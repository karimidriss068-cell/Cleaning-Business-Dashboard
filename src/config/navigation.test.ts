import { afterEach, describe, expect, it, vi } from "vitest";

const PROTOTYPES = ["/sales", "/agents", "/data-room"];

describe("prototype screens are off by default", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("hides them from the office menu", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_ROUTES", "");
    vi.resetModules();
    const { officeNav } = await import("./navigation");
    const hrefs = officeNav.map((i) => i.href);
    for (const h of PROTOTYPES) expect(hrefs).not.toContain(h);
  });

  it("shows them only when the flag is 1", async () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOTYPE_ROUTES", "1");
    vi.resetModules();
    const { officeNav } = await import("./navigation");
    const hrefs = officeNav.map((i) => i.href);
    for (const h of PROTOTYPES) expect(hrefs).toContain(h);
  });
});
