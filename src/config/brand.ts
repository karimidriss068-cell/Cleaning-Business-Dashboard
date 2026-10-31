/**
 * Brand and design tokens: the single source for the product name and every
 * color, font pairing, effect, radius, elevation, motion and density value in
 * DESIGN.md.
 *
 * Three visual directions are defined while the owner chooses one. Each has a
 * dark palette (primary) and a light palette (secondary). The active direction
 * is a data-direction attribute on <html> (see src/lib/theme/direction.ts).
 *
 * "Keystone Clean" is provisional. Rename it here and nowhere else.
 * Every color pair, in every direction and theme, is contrast-checked by
 * src/config/brand.test.ts; run `npm test` after changing any value.
 */

export const brand = {
  name: "Keystone Clean",
  shortName: "Keystone",
  description:
    "Operations platform for Keystone Clean, residential and commercial cleaning across New York City's five boroughs.",
  loginTagline: "Schedules, crews, leads and invoices in one cockpit.",
} as const;

export type ThemeName = "light" | "dark";
export const defaultTheme: ThemeName = "dark";

export type Palette = {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  /** Accent-tinted panel for callouts (replaces the old sand surface). */
  highlight: string;
  text: string;
  textMuted: string;
  crewTextMuted: string;
  accent: string;
  accentText: string;
  /** Second cool hue: the "quoted" lead stage and chart series 2. */
  accent2: string;
  primary: string;
  primaryLabel: string;
  borderSubtle: string;
  borderInput: string;
  focus: string;
  infoSoft: string;
  successText: string;
  successSoft: string;
  successFill: string;
  successLabel: string;
  warningText: string;
  warningSoft: string;
  warningFill: string;
  warningLabel: string;
  dangerText: string;
  dangerSoft: string;
  dangerFill: string;
  dangerLabel: string;
  sidebar: string;
  sidebarText: string;
  sidebarTextMuted: string;
  sidebarActiveBg: string;
  sidebarActiveText: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
};

/** Decorative values (not text), so they aren't part of the contrast test. */
export type Effects = {
  /** Accent glow for the primary button, KPI numerals and sparkline ends. */
  glow: string;
  /** Soft accent light in the ambient background. */
  ambient: string;
  /** Fine grid lines in the ambient background. */
  grid: string;
  /** Opacity of the surface color in glass panels. */
  glassAlpha: number;
};

/** Google Fonts loaded in src/app/layout.tsx; keys map to next/font instances. */
export type FontKey = "sora" | "manrope" | "unbounded" | "figtree" | "syne" | "plexSans";

export type Direction = {
  label: string;
  mood: string;
  fonts: { display: FontKey; body: FontKey };
  palettes: Record<ThemeName, Palette>;
  effects: Record<ThemeName, Effects>;
};

export const directions = {
  titanium: {
    label: "Titanium & Ice",
    mood: "Machined steel surfaces, ice-blue signal.",
    fonts: { display: "sora", body: "manrope" },
    palettes: {
      dark: {
        canvas: "#0C0F14",
        surface: "#131820",
        surfaceRaised: "#1B222C",
        highlight: "#273241",
        text: "#E8EDF3",
        textMuted: "#93A0B1",
        crewTextMuted: "#9AA6B6",
        accent: "#8EC5FF",
        accentText: "#8EC5FF",
        accent2: "#C4B8FF",
        primary: "#8EC5FF",
        primaryLabel: "#0C0F14",
        borderSubtle: "#282D35",
        borderInput: "#6B7078",
        focus: "#8EC5FF",
        infoSoft: "#273444",
        successText: "#4CC38A",
        successSoft: "#1C3331",
        successFill: "#4CC38A",
        successLabel: "#0C0F14",
        warningText: "#F0B54A",
        warningSoft: "#363127",
        warningFill: "#F0B54A",
        warningLabel: "#0C0F14",
        dangerText: "#F2777A",
        dangerSoft: "#37272E",
        dangerFill: "#F2777A",
        dangerLabel: "#0C0F14",
        sidebar: "#10141A",
        sidebarText: "#E8EDF3",
        sidebarTextMuted: "#93A0B1",
        sidebarActiveBg: "#1B222C",
        sidebarActiveText: "#8EC5FF",
        chart1: "#8EC5FF",
        chart2: "#C4B8FF",
        chart3: "#6D7786",
        chart4: "#4CC38A",
        chart5: "#F0B54A",
      },
      light: {
        canvas: "#F1F4F8",
        surface: "#FFFFFF",
        surfaceRaised: "#F8FAFC",
        highlight: "#F6FAFF",
        text: "#0C0F14",
        textMuted: "#65686D",
        crewTextMuted: "#54575C",
        accent: "#6A93BE",
        accentText: "#516F91",
        accent2: "#8982B4",
        primary: "#557699",
        primaryLabel: "#FFFFFF",
        borderSubtle: "#DADDE1",
        borderInput: "#85888D",
        focus: "#648BB4",
        infoSoft: "#EFF7FF",
        successText: "#25784D",
        successSoft: "#E6F3EC",
        successFill: "#25784D",
        successLabel: "#FFFFFF",
        warningText: "#8D6315",
        warningSoft: "#F9F1E3",
        warningFill: "#8D6315",
        warningLabel: "#FFFFFF",
        dangerText: "#B93D3E",
        dangerSoft: "#FAE9E9",
        dangerFill: "#B93D3E",
        dangerLabel: "#FFFFFF",
        sidebar: "#FFFFFF",
        sidebarText: "#0C0F14",
        sidebarTextMuted: "#65686D",
        sidebarActiveBg: "#EFF7FF",
        sidebarActiveText: "#516F91",
        chart1: "#6A93BE",
        chart2: "#8982B4",
        chart3: "#8E9093",
        chart4: "#25784D",
        chart5: "#8D6315",
      },
    },
    effects: {
      dark: { glow: "rgb(142 197 255 / 0.35)", ambient: "rgb(142 197 255 / 0.10)", grid: "rgb(232 237 243 / 0.035)", glassAlpha: 0.72 },
      light: { glow: "rgb(142 197 255 / 0.25)", ambient: "rgb(142 197 255 / 0.060)", grid: "rgb(12 15 20 / 0.04)", glassAlpha: 0.78 },
    },
  },
  ocean: {
    label: "Deep Ocean & Aqua",
    mood: "Abyssal blues with a bioluminescent aqua edge.",
    fonts: { display: "unbounded", body: "figtree" },
    palettes: {
      dark: {
        canvas: "#06121C",
        surface: "#0B1C2A",
        surfaceRaised: "#122A3C",
        highlight: "#16394B",
        text: "#E4F1F7",
        textMuted: "#8AA5B5",
        crewTextMuted: "#92ABBB",
        accent: "#3CCFE0",
        accentText: "#3CCFE0",
        accent2: "#93B6FF",
        primary: "#3CCFE0",
        primaryLabel: "#06121C",
        borderSubtle: "#21313F",
        borderInput: "#687882",
        focus: "#3CCFE0",
        infoSoft: "#133947",
        successText: "#4CC38A",
        successSoft: "#153739",
        successFill: "#4CC38A",
        successLabel: "#06121C",
        warningText: "#F0B54A",
        warningSoft: "#30342F",
        warningFill: "#F0B54A",
        warningLabel: "#06121C",
        dangerText: "#F2777A",
        dangerSoft: "#302B37",
        dangerFill: "#F2777A",
        dangerLabel: "#06121C",
        sidebar: "#091723",
        sidebarText: "#E4F1F7",
        sidebarTextMuted: "#8AA5B5",
        sidebarActiveBg: "#122A3C",
        sidebarActiveText: "#3CCFE0",
        chart1: "#3CCFE0",
        chart2: "#93B6FF",
        chart3: "#647C8B",
        chart4: "#4CC38A",
        chart5: "#F0B54A",
      },
      light: {
        canvas: "#EDF5F8",
        surface: "#FFFFFF",
        surfaceRaised: "#F6FAFC",
        highlight: "#EFFBFD",
        text: "#06121C",
        textMuted: "#5F6971",
        crewTextMuted: "#4E5860",
        accent: "#2E9DAC",
        accentText: "#237684",
        accent2: "#6C88BF",
        primary: "#257E8C",
        primaryLabel: "#FFFFFF",
        borderSubtle: "#D6DEE2",
        borderInput: "#7F898F",
        focus: "#2C95A4",
        infoSoft: "#E4F8FB",
        successText: "#23784F",
        successSoft: "#E6F3EC",
        successFill: "#23784F",
        successLabel: "#FFFFFF",
        warningText: "#8C6418",
        warningSoft: "#F9F1E3",
        warningFill: "#8C6418",
        warningLabel: "#FFFFFF",
        dangerText: "#B83E3F",
        dangerSoft: "#FAE9E9",
        dangerFill: "#B83E3F",
        dangerLabel: "#FFFFFF",
        sidebar: "#FFFFFF",
        sidebarText: "#06121C",
        sidebarTextMuted: "#5F6971",
        sidebarActiveBg: "#E4F8FB",
        sidebarActiveText: "#237684",
        chart1: "#2E9DAC",
        chart2: "#6C88BF",
        chart3: "#899095",
        chart4: "#23784F",
        chart5: "#8C6418",
      },
    },
    effects: {
      dark: { glow: "rgb(60 207 224 / 0.32)", ambient: "rgb(60 207 224 / 0.10)", grid: "rgb(232 237 243 / 0.035)", glassAlpha: 0.72 },
      light: { glow: "rgb(60 207 224 / 0.22)", ambient: "rgb(60 207 224 / 0.060)", grid: "rgb(12 15 20 / 0.04)", glassAlpha: 0.78 },
    },
  },
  midnight: {
    label: "Midnight & Periwinkle",
    mood: "Ink-black night with a soft periwinkle glow.",
    fonts: { display: "syne", body: "plexSans" },
    palettes: {
      dark: {
        canvas: "#0A0B14",
        surface: "#11131F",
        surfaceRaised: "#1A1D2E",
        highlight: "#252A43",
        text: "#ECEEF8",
        textMuted: "#9499B5",
        crewTextMuted: "#9CA1BB",
        accent: "#8B9CFF",
        accentText: "#8B9CFF",
        accent2: "#74D4F2",
        primary: "#8B9CFF",
        primaryLabel: "#0A0B14",
        borderSubtle: "#272935",
        borderInput: "#6B6D78",
        focus: "#8B9CFF",
        infoSoft: "#252943",
        successText: "#4CC38A",
        successSoft: "#1A2F30",
        successFill: "#4CC38A",
        successLabel: "#0A0B14",
        warningText: "#F0B54A",
        warningSoft: "#352D26",
        warningFill: "#F0B54A",
        warningLabel: "#0A0B14",
        dangerText: "#F2777A",
        dangerSoft: "#35232E",
        dangerFill: "#F2777A",
        dangerLabel: "#0A0B14",
        sidebar: "#0E0F1A",
        sidebarText: "#ECEEF8",
        sidebarTextMuted: "#9499B5",
        sidebarActiveBg: "#1A1D2E",
        sidebarActiveText: "#8B9CFF",
        chart1: "#8B9CFF",
        chart2: "#74D4F2",
        chart3: "#6D7188",
        chart4: "#4CC38A",
        chart5: "#F0B54A",
      },
      light: {
        canvas: "#F2F2F9",
        surface: "#FFFFFF",
        surfaceRaised: "#F9F9FC",
        highlight: "#F6F7FF",
        text: "#0A0B14",
        textMuted: "#676770",
        crewTextMuted: "#55565E",
        accent: "#7A89E0",
        accentText: "#5C67A9",
        accent2: "#5090A7",
        primary: "#626EB5",
        primaryLabel: "#FFFFFF",
        borderSubtle: "#DBDBE2",
        borderInput: "#86878F",
        focus: "#7381D4",
        infoSoft: "#EFF1FF",
        successText: "#25784E",
        successSoft: "#E6F3EC",
        successFill: "#25784E",
        successLabel: "#FFFFFF",
        warningText: "#8F6315",
        warningSoft: "#F9F1E3",
        warningFill: "#8F6315",
        warningLabel: "#FFFFFF",
        dangerText: "#B93D3E",
        dangerSoft: "#FAE9E9",
        dangerFill: "#B93D3E",
        dangerLabel: "#FFFFFF",
        sidebar: "#FFFFFF",
        sidebarText: "#0A0B14",
        sidebarTextMuted: "#676770",
        sidebarActiveBg: "#EFF1FF",
        sidebarActiveText: "#5C67A9",
        chart1: "#7A89E0",
        chart2: "#5090A7",
        chart3: "#8F8F95",
        chart4: "#25784E",
        chart5: "#8F6315",
      },
    },
    effects: {
      dark: { glow: "rgb(139 156 255 / 0.35)", ambient: "rgb(139 156 255 / 0.11)", grid: "rgb(232 237 243 / 0.035)", glassAlpha: 0.72 },
      light: { glow: "rgb(139 156 255 / 0.25)", ambient: "rgb(139 156 255 / 0.061)", grid: "rgb(12 15 20 / 0.04)", glassAlpha: 0.78 },
    },
  },
} satisfies Record<string, Direction>;

export type DirectionId = keyof typeof directions;
export const directionIds = Object.keys(directions) as DirectionId[];
export const defaultDirection: DirectionId = "titanium";

/** DESIGN.md section 5. */
export const radius = {
  none: "0px",
  xs: "4px",
  sm: "8px",
  md: "14px",
  lg: "20px",
  full: "9999px",
} as const;

/** DESIGN.md section 6. Deep, soft shadows in dark; light mode stays airy. */
/**
 * Glass system (DESIGN.md section 4b). One spec drives the CSS tokens and the
 * contrast test, so what is tested is what is painted. Levels are how far a
 * panel floats: card (in the page), popover (menus, selects, toasts), modal
 * (dialogs, drawers) and sidebar (shell chrome). Alpha is the surface color's
 * opacity; blur is in px before the phone/reduced-effects scale.
 */
export type GlassLevel = "card" | "popover" | "modal" | "sidebar";
export const glassLevels: GlassLevel[] = ["card", "popover", "modal", "sidebar"];
export const glassSpec = {
  alpha: {
    dark: { card: 0.46, popover: 0.8, modal: 0.85, sidebar: 0.5 },
    light: { card: 0.46, popover: 0.84, modal: 0.9, sidebar: 0.52 },
  } satisfies Record<ThemeName, Record<GlassLevel, number>>,
  blur: { card: 14, popover: 22, modal: 26, sidebar: 20 } satisfies Record<GlassLevel, number>,
  /** Share of the text color mixed into the 1px glass border. */
  borderMix: { dark: 0.2, light: 0.13 } satisfies Record<ThemeName, number>,
  /** Soft light on a panel's top edge (inset). */
  highlight: { dark: "rgb(255 255 255 / 0.26)", light: "rgb(255 255 255 / 0.95)" } satisfies Record<ThemeName, string>,
  /** Left-edge light and the brighter border shown on hover. */
  highlightSide: { dark: "rgb(255 255 255 / 0.12)", light: "rgb(255 255 255 / 0.7)" } satisfies Record<ThemeName, string>,
  borderHoverMix: { dark: 0.3, light: 0.2 } satisfies Record<ThemeName, number>,
  /** Soft accent glow inside the panel edge, as opacity of the accent. */
  innerGlow: { dark: 0.12, light: 0.07 } satisfies Record<ThemeName, number>,
  /** White glossy sheen laid over the panel's top-left corner, as opacity. */
  sheen: { dark: 0.07, light: 0.5 } satisfies Record<ThemeName, number>,
  /** Flat tiles have no backdrop filter (they repeat in lists), so they are more opaque instead. */
  flatAlpha: { dark: 0.9, light: 0.88 } satisfies Record<ThemeName, number>,
  /** Backdrop brightness behind glass: dark glass is smoked (the aurora shows through dimmed), light glass is frosted (washed lighter). */
  brightness: { dark: 0.35, light: 1.2 } satisfies Record<ThemeName, number>,
  /** Peak opacity of the three aurora blobs (accent, accent2, accent) behind the glass. */
  aurora: { dark: { a1: 0.34, a2: 0.26, a3: 0.2 }, light: { a1: 0.22, a2: 0.17, a3: 0.12 } } satisfies Record<ThemeName, { a1: number; a2: number; a3: number }>,
  /** Minimum surface opacity on phones / reduced effects (cheaper, more solid). */
  phoneFloor: 0.92,
  /** Blur multiplier on phones; reduced transparency uses solid surfaces and no blur. */
  phoneBlurScale: 0.5,
  /** Outer shadows per level (the inset highlight is added in CSS). */
  shadow: {
    dark: {
      card: "0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.6)",
      popover: "0 16px 40px -12px rgb(0 0 0 / 0.7), 0 4px 12px rgb(0 0 0 / 0.35)",
      modal: "0 32px 80px -16px rgb(0 0 0 / 0.8), 0 8px 24px rgb(0 0 0 / 0.4)",
      sidebar: "0 16px 40px -12px rgb(0 0 0 / 0.7), 0 4px 12px rgb(0 0 0 / 0.35)",
    },
    light: {
      card: "0 1px 2px rgb(12 15 20 / 0.05), 0 6px 16px -10px rgb(12 15 20 / 0.12)",
      popover: "0 12px 32px -12px rgb(12 15 20 / 0.18), 0 2px 6px rgb(12 15 20 / 0.06)",
      modal: "0 28px 64px -20px rgb(12 15 20 / 0.28), 0 4px 12px rgb(12 15 20 / 0.08)",
      sidebar: "0 12px 32px -12px rgb(12 15 20 / 0.18), 0 2px 6px rgb(12 15 20 / 0.06)",
    },
  } satisfies Record<ThemeName, Record<GlassLevel, string>>,
} as const;

export const elevation: Record<ThemeName, Record<"e0" | "e1" | "e2" | "e3", string>> = {
  dark: {
    e0: "none",
    e1: "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.6)",
    e2: "0 1px 0 rgb(255 255 255 / 0.05) inset, 0 16px 40px -12px rgb(0 0 0 / 0.7), 0 4px 12px rgb(0 0 0 / 0.35)",
    e3: "0 1px 0 rgb(255 255 255 / 0.06) inset, 0 32px 80px -16px rgb(0 0 0 / 0.8), 0 8px 24px rgb(0 0 0 / 0.4)",
  },
  light: {
    e0: "none",
    e1: "0 1px 2px rgb(12 15 20 / 0.05), 0 6px 16px -10px rgb(12 15 20 / 0.12)",
    e2: "0 12px 32px -12px rgb(12 15 20 / 0.18), 0 2px 6px rgb(12 15 20 / 0.06)",
    e3: "0 28px 64px -20px rgb(12 15 20 / 0.28), 0 4px 12px rgb(12 15 20 / 0.08)",
  },
};

/** DESIGN.md section 7. Durations and delays become 0ms under prefers-reduced-motion. */
export const motion = {
  fast: "140ms",
  base: "220ms",
  slow: "320ms",
  enter: "620ms",
  stagger: "55ms",
  easeStandard: "cubic-bezier(0.2, 0, 0, 1)",
  easeExit: "cubic-bezier(0.4, 0, 1, 1)",
  easeEnter: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/** DESIGN.md section 8. */
export const density = {
  comfortable: { rowHeight: "48px", cellY: "12px", cellX: "16px", fontSize: "14px" },
  compact: { rowHeight: "34px", cellY: "6px", cellX: "12px", fontSize: "13px" },
} as const;

export type Density = keyof typeof density;
