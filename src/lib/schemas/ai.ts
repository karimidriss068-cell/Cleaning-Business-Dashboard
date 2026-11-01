import { z } from "zod";
import { parseDollarsToCents } from "@/lib/format";

// Inputs of the owner-only AI budget actions. The database checks them again.

const capCents = z.number().int().min(0, "A cap can't be negative").max(10_000_000, "That cap is too large").nullable();

export const budgetSchema = z
  .object({
    scope: z.enum(["global", "feature", "bot", "user"]),
    key: z.string().trim().regex(/^[A-Za-z0-9*_-]{1,80}$/, "Use letters, digits, - or _ (or * for the default)"),
    dailyCents: capCents,
    monthlyCents: capCents,
    hardStop: z.boolean(),
  })
  .refine((b) => b.scope !== "global" || b.key === "*", { path: ["key"], message: "The global cap has no name" })
  .refine((b) => b.dailyCents === null || b.monthlyCents === null || b.dailyCents <= b.monthlyCents, {
    path: ["dailyCents"],
    message: "The daily cap can't be more than the monthly cap",
  });

export const removeBudgetSchema = z.object({ scope: z.enum(["feature", "bot", "user"]), key: z.string().trim().regex(/^[A-Za-z0-9*_-]{1,80}$/) });
export const killSwitchSchema = z.object({ on: z.boolean() });

/** "" means no cap; otherwise dollars typed by a person, as integer cents. Null with a message when it isn't an amount. */
export function capFromInput(text: string): { cents: number | null } | { error: string } {
  const t = text.trim();
  if (t === "") return { cents: null };
  const cents = parseDollarsToCents(t);
  if (cents === null || cents < 0) return { error: "Enter a dollar amount like 5 or 0.50" };
  return { cents };
}
