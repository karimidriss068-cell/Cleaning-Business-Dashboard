import { z } from "zod";
import { defaultDirection, defaultTheme, directionIds, type DirectionId } from "@/config/brand";

export const themeChoices = ["dark", "light", "system"] as const;
export type ThemeChoice = (typeof themeChoices)[number];

/** Server-readable mirror of the saved direction, so the first paint is right. */
export const DIRECTION_COOKIE = "kc-direction";
export const DIRECTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const preferencesSchema = z.object({
  direction: z.enum(directionIds as [DirectionId, ...DirectionId[]]),
  theme: z.enum(themeChoices),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** Partial update from the appearance controls (validated at the server action). */
export const preferencesUpdateSchema = preferencesSchema.partial().refine((v) => v.direction !== undefined || v.theme !== undefined, {
  message: "Nothing to update",
});

export const defaultPreferences: Preferences = { direction: defaultDirection, theme: defaultTheme };

export function isDirection(value: unknown): value is DirectionId {
  return typeof value === "string" && (directionIds as string[]).includes(value);
}

/**
 * The direction to show, in order of trust: the user's saved preference, the
 * cookie mirror, this browser's localStorage, then the default. Anything
 * invalid at a level falls through to the next.
 */
export function resolveDirection(sources: { saved?: unknown; cookie?: unknown; local?: unknown }): DirectionId {
  for (const candidate of [sources.saved, sources.cookie, sources.local]) {
    if (isDirection(candidate)) return candidate;
  }
  return defaultDirection;
}
