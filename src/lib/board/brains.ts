import type { AdvisorKey } from "@/lib/board/advisors";
import { HOT_SHEETS } from "@/lib/board/brains/hot.generated";
import { PORTRAIT, type PortraitWho } from "@/lib/board/scene/portraits";

// Reasoning brains ported from the original Roast Room (brains/<slug>/_hot.md). The seat -> person
// mapping is derived from PORTRAIT so the face and the brain always match. Hot sheets are prebundled
// as strings (scripts/gen-board-brains.mjs) so no filesystem read is needed at runtime.
export const BRAIN_SLUG_FOR_PORTRAIT: Record<string, string> = {
  buffett: "warren-buffett", hormozi: "alex-hormozi", wickman: "gino-wickman", graham: "paul-graham",
  garyvee: "gary-vaynerchuk", leila: "leila-hormozi", naval: "naval-ravikant", musk: "elon-musk",
  bezos: "jeff-bezos", martell: "dan-martell", sanchez: "codie-sanchez", blakely: "sara-blakely",
};

export const brainSlug = (who: PortraitWho | AdvisorKey): string | null => BRAIN_SLUG_FOR_PORTRAIT[PORTRAIT[who as PortraitWho]] ?? null;

export function hotSheet(who: PortraitWho | AdvisorKey): string | null {
  const slug = brainSlug(who);
  return slug ? HOT_SHEETS[slug] ?? null : null;
}
