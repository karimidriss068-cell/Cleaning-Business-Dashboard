import { addDays, formatCalendarDate, formatCents, formatNyDate, formatNyTime, nyDateString } from "@/lib/format";
import { COI_WARNING_DAYS } from "@/lib/dispatch";

/** complete_job refuses earlier than this long before the scheduled start. */
export const OPEN_BEFORE_START_MINUTES = 60;

export function completeOpensAt(start: string | Date): Date {
  return new Date(new Date(start).getTime() - OPEN_BEFORE_START_MINUTES * 60000);
}

export type CompleteState =
  | { kind: "done" }
  | { kind: "closed" }
  | { kind: "too_early"; opensAt: Date; label: string }
  | { kind: "open" };

/** What the Complete button should do right now, mirroring the database rule. */
export function completeState(now: Date, start: string | Date, status: string): CompleteState {
  if (status === "completed") return { kind: "done" };
  if (status !== "scheduled" && status !== "in_progress") return { kind: "closed" };
  const opensAt = completeOpensAt(start);
  if (now.getTime() < opensAt.getTime()) {
    const sameDay = nyDateString(opensAt) === nyDateString(now);
    return { kind: "too_early", opensAt, label: sameDay ? formatNyTime(opensAt) : `${formatNyDate(opensAt, "weekday")}, ${formatNyTime(opensAt)}` };
  }
  return { kind: "open" };
}

const CITY: Record<string, string> = { manhattan: "New York", brooklyn: "Brooklyn", queens: "Queens", bronx: "Bronx", staten_island: "Staten Island" };

/** A maps link for the visit's address (opens the maps app on a phone). */
export function mapsUrl(v: { address_line1: string; borough: string | null; zip: string }): string {
  const city = v.borough ? (CITY[v.borough] ?? "New York") : "New York";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.address_line1}, ${city}, NY ${v.zip}`)}`;
}

export const addressLine = (v: { address_line1: string; address_line2: string | null; borough: string | null; zip: string }) =>
  `${[v.address_line1, v.address_line2].filter(Boolean).join(", ")}, ${v.borough ? (CITY[v.borough] ?? "New York") : "New York"} ${v.zip}`;

export function payLabel(payCents: number | null, pending: boolean): string {
  return pending || payCents === null ? "Pay set after the visit" : formatCents(payCents);
}

export const checklistLabel = (done: number, total: number) => (total === 0 ? "No checklist" : `${done} of ${total} tasks`);

/** Splits visits into today's and the days after, grouped by New York date. */
export function groupVisits<T extends { scheduled_start: string }>(visits: T[], today: string): { today: T[]; upcoming: { date: string; visits: T[] }[] } {
  const byDate = new Map<string, T[]>();
  for (const v of [...visits].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))) {
    const d = nyDateString(v.scheduled_start);
    byDate.set(d, [...(byDate.get(d) ?? []), v]);
  }
  return {
    today: byDate.get(today) ?? [],
    upcoming: [...byDate.entries()].filter(([d]) => d > today).sort(([a], [b]) => a.localeCompare(b)).map(([date, vs]) => ({ date, visits: vs })),
  };
}

export type InsuranceReminder = { tone: "danger" | "warning"; title: string; detail: string };

/** The banner a cleaner sees about their insurance certificate, or null if it's fine. */
export function insuranceReminder(expiresOn: string | null, today: string): InsuranceReminder | null {
  if (!expiresOn) return { tone: "warning", title: "No insurance certificate on file", detail: "Send your certificate to the office so you can keep getting visits." };
  if (expiresOn < today) return { tone: "danger", title: "Your insurance certificate has expired", detail: `It expired on ${formatCalendarDate(expiresOn)}. The office can't assign you visits until a new one is on file.` };
  if (expiresOn <= addDays(today, COI_WARNING_DAYS)) {
    const days = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    return { tone: "warning", title: days === 0 ? "Your insurance certificate expires today" : `Your insurance certificate expires in ${days} day${days === 1 ? "" : "s"}`, detail: `Expires ${formatCalendarDate(expiresOn)}. Send a renewed certificate to the office.` };
  }
  return null;
}

// ---------------------------------------------------------------- photos

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

/** Mirrors the bucket's limits so the cleaner gets a clear message before uploading. */
export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "That file isn't a photo. Use a JPG, PNG, WebP or HEIC image.";
  if (file.size > PHOTO_MAX_BYTES) return `That photo is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is 10 MB.`;
  if (file.size === 0) return "That photo is empty. Try taking it again.";
  return null;
}

export const photoExtension = (type: string) => EXT[type] ?? "jpg";
export const photoPath = (jobId: string, fileId: string, type: string) => `${jobId}/${fileId}.${photoExtension(type)}`;
