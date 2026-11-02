import type { AdvisorKey } from "@/lib/board/advisors";

// Shared by the three scene styles: one thin-line glyph per lens (outline only, no fill) and the tone
// each lens uses. All original and abstract: a shape that hints at what the lens guards, never a person.

export type AvatarWho = AdvisorKey | "chair";
export type NodeState = "idle" | "thinking" | "speaking";

export const TONE: Record<AvatarWho, string> = {
  cash_ruin: "kc-tone-0", offers_pricing: "kc-tone-1", operations: "kc-tone-2", strategy: "kc-tone-4",
  marketing: "kc-tone-5", hiring: "kc-tone-6", leverage: "kc-tone-3", contrarian: "kc-tone-7",
  systems: "kc-tone-2", deals: "kc-tone-0", scrappy: "kc-tone-5", chair: "kc-tone-chair",
};

/** Drawn in a 100 x 100 box, centred on (50, 50), about 44 units across. Stroke comes from --char. */
export function Glyph({ who, width = 1.6 }: { who: AvatarWho; width?: number }) {
  return (
    <g className="fill-none stroke-(--char)" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {who === "cash_ruin" && <path d="M50 28 L68 34 V50 C68 61 60 67 50 72 C40 67 32 61 32 50 V34 Z" />}
      {who === "offers_pricing" && <><rect x="33" y="33" width="34" height="36" rx="10" /><circle cx="50" cy="40" r="2" /></>}
      {who === "operations" && <path d="M50 28 L68 39 V61 L50 72 L32 61 V39 Z" />}
      {who === "strategy" && <path d="M50 26 L72 50 L50 74 L28 50 Z" />}
      {who === "marketing" && <><circle cx="46" cy="50" r="17" /><path d="M68 41 Q73 50 68 59 M74 36 Q81 50 74 64" /></>}
      {who === "hiring" && <><circle cx="43" cy="50" r="14" /><circle cx="57" cy="50" r="14" /></>}
      {who === "leverage" && <><rect x="30" y="34" width="40" height="36" rx="14" /><path d="M34 28 L66 22" /></>}
      {who === "contrarian" && <><rect x="32" y="37" width="36" height="34" rx="11" /><path d="M36 37 L32 25 M64 37 L68 25" /></>}
      {who === "systems" && <><circle cx="50" cy="50" r="20" /><path d="M50 38 V50 L59 56" /></>}
      {who === "deals" && <><rect x="30" y="40" width="40" height="28" rx="8" /><path d="M42 40 V34 H58 V40" /></>}
      {who === "scrappy" && <path d="M50 26 L58 46 L74 50 L58 54 L50 74 L42 54 L26 50 L42 46 Z" />}
      {who === "chair" && <><rect x="28" y="34" width="44" height="36" rx="16" /><path d="M40 52 H60 M50 52 V62" /></>}
    </g>
  );
}
