import type { AdvisorKey } from "@/lib/board/advisors";

// Visual only: which portrait frame set (ported from the original Roast Room) draws each seat.
// Personas stay MAKI's own lenses; the UI keeps the AI_LABEL disclaimer.
export type PortraitWho = AdvisorKey | "chair";
export const PORTRAIT_SHAPES = ["base", "open", "mid", "blink"] as const;
export type PortraitShape = (typeof PORTRAIT_SHAPES)[number];

export const PORTRAIT: Record<PortraitWho, string> = {
  cash_ruin: "buffett", offers_pricing: "hormozi", operations: "wickman", strategy: "graham",
  marketing: "garyvee", hiring: "leila", leverage: "naval", contrarian: "musk",
  systems: "martell", deals: "sanchez", scrappy: "blakely", chair: "bezos",
};

export const portraitSrc = (who: PortraitWho, shape: PortraitShape = "base") => `/board/portraits/${PORTRAIT[who]}-${shape}.webp`;
