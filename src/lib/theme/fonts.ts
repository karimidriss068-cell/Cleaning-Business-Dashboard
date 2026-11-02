import { DM_Mono, DM_Sans, Figtree, IBM_Plex_Sans, Manrope, Mohave, Sora, Syne, Unbounded } from "next/font/google";
import { directions, type DirectionId, type FontKey } from "@/config/brand";

// Every face a direction can use. preload is off for all of them: the root
// layout only attaches the selected direction's two font variables, so the
// browser downloads just those two families (an unreferenced @font-face is
// never fetched). Variable names must match fontVar in tokens-css.ts.
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap", preload: false });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap", preload: false });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], display: "swap", preload: false });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap", preload: false });
const syne = Syne({ variable: "--font-syne", subsets: ["latin"], display: "swap", preload: false });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", preload: false });
const mohave = Mohave({ variable: "--font-mohave", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap", preload: false });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false });

const faces: Record<FontKey, { variable: string }> = { sora, manrope, unbounded, figtree, syne, plexSans, mohave, dmSans };

/** Font variable classes for one direction (display + body + mono). */
export function directionFontClasses(direction: DirectionId): string {
  const { display, body } = directions[direction].fonts;
  return [faces[display].variable, faces[body].variable, dmMono.variable].join(" ");
}

/** Every direction's faces, for the Settings previews only. */
export const allFontClasses = [...Object.values(faces).map((f) => f.variable), dmMono.variable].join(" ");
