import { describe, expect, it } from "vitest";
import { defaultPreferences, preferencesSchema, preferencesUpdateSchema, resolveDirection } from "./preferences";

describe("appearance preferences", () => {
  it("defaults to Titanium & Ice in dark mode", () => {
    expect(defaultPreferences).toEqual({ direction: "titanium", theme: "dark" });
  });

  it("resolves saved > cookie > localStorage > default, skipping invalid values", () => {
    expect(resolveDirection({ saved: "ocean", cookie: "midnight", local: "titanium" })).toBe("ocean");
    expect(resolveDirection({ saved: undefined, cookie: "midnight", local: "ocean" })).toBe("midnight");
    expect(resolveDirection({ cookie: "gold", local: "ocean" })).toBe("ocean");
    expect(resolveDirection({ saved: null, cookie: "", local: "neon" })).toBe("titanium");
    expect(resolveDirection({})).toBe("titanium");
  });

  it("validates full and partial preferences", () => {
    expect(preferencesSchema.safeParse({ direction: "midnight", theme: "light" }).success).toBe(true);
    expect(preferencesSchema.safeParse({ direction: "gold", theme: "dark" }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({ theme: "system" }).success).toBe(true);
    expect(preferencesUpdateSchema.safeParse({ theme: "sepia" }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({}).success).toBe(false);
  });
});
