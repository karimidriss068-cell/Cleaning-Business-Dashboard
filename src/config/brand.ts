/**
 * Brand and design tokens: the single source for the product name and every
 * color, radius, elevation, motion and density value in DESIGN.md.
 *
 * "Keystone Clean" is provisional. Rename it here and nowhere else.
 * Every color pair is contrast-checked by src/config/brand.test.ts; run
 * `npm test` after changing any value.
 */

export const brand = {
  name: "Keystone Clean",
  shortName: "Keystone",
  description:
    "Operations platform for Keystone Clean, residential and commercial cleaning across New York City's five boroughs.",
  loginTagline: "Schedules, crews, leads and invoices in one place.",
} as const;

export type ThemeName = "light" | "dark";

export type Palette = {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  sand: string;
  text: string;
  textMuted: string;
  crewTextMuted: string;
  accent: string;
  accentText: string;
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

/** The Harbor palette, as approved (DESIGN.md section 2). */
export const harbor = {
  navy: "#0F2A3D",
  teal: "#1F9D9A",
  mist: "#EAF2F3",
  sand: "#E9E2D6",
} as const;

export const palettes: Record<ThemeName, Palette> = {
  light: {
    canvas: harbor.mist,
    surface: "#FFFFFF",
    surfaceRaised: "#F6F9FA",
    sand: harbor.sand,
    text: harbor.navy,
    textMuted: "#506573",
    crewTextMuted: "#324A5A",
    accent: harbor.teal,
    accentText: "#186C72",
    primary: "#1B8083",
    primaryLabel: "#FFFFFF",
    borderSubtle: "#D4DEE1",
    borderInput: "#768893",
    focus: "#1C8A8B",
    infoSoft: "#E4F3F3",
    successText: "#247856",
    successSoft: "#E6F3EC",
    successFill: "#247856",
    successLabel: "#FFFFFF",
    warningText: "#7D692B",
    warningSoft: "#FBF4E4",
    warningFill: "#E0A21B",
    warningLabel: harbor.navy,
    dangerText: "#B54144",
    dangerSoft: "#FAE9E9",
    dangerFill: "#B54144",
    dangerLabel: "#FFFFFF",
    sidebar: harbor.navy,
    sidebarText: harbor.mist,
    sidebarTextMuted: "#95A4AC",
    sidebarActiveBg: "#163852",
    sidebarActiveText: "#4CB0AE",
    chart1: harbor.teal,
    chart2: "#3A6F95",
    chart3: "#8A7656",
    chart4: "#247856",
    chart5: "#7D692B",
  },
  dark: {
    canvas: "#0A1C29",
    surface: harbor.navy,
    surfaceRaised: "#163852",
    sand: "#2B2A26",
    text: harbor.mist,
    textMuted: "#95A4AC",
    crewTextMuted: "#AAB8BE",
    accent: harbor.teal,
    accentText: "#4CB0AE",
    primary: "#5CB7B5",
    primaryLabel: harbor.navy,
    borderSubtle: "#294253",
    borderInput: "#748691",
    focus: harbor.teal,
    infoSoft: "#113A4A",
    successText: "#6EBB93",
    successSoft: "#143B43",
    successFill: "#6EBB93",
    successLabel: harbor.navy,
    warningText: "#E1A82A",
    warningSoft: "#283839",
    warningFill: "#E0A21B",
    warningLabel: harbor.navy,
    dangerText: "#DE8A8B",
    dangerSoft: "#3B303F",
    dangerFill: "#DE8A8B",
    dangerLabel: harbor.navy,
    sidebar: "#0A1C29",
    sidebarText: harbor.mist,
    sidebarTextMuted: "#95A4AC",
    sidebarActiveBg: "#163852",
    sidebarActiveText: "#4CB0AE",
    chart1: harbor.teal,
    chart2: "#7FA6C4",
    chart3: "#C4B394",
    chart4: "#6EBB93",
    chart5: "#E1A82A",
  },
};

/** DESIGN.md section 5. */
export const radius = {
  none: "0px",
  xs: "4px",
  sm: "6px",
  md: "10px",
  lg: "16px",
  full: "9999px",
} as const;

/** DESIGN.md section 6. Navy-tinted in light mode, deeper and subtler in dark. */
export const elevation: Record<ThemeName, Record<"e0" | "e1" | "e2" | "e3", string>> = {
  light: {
    e0: "none",
    e1: "0 1px 2px rgb(15 42 61 / 0.06), 0 1px 1px rgb(15 42 61 / 0.04)",
    e2: "0 8px 24px rgb(15 42 61 / 0.12), 0 2px 6px rgb(15 42 61 / 0.06)",
    e3: "0 24px 48px rgb(15 42 61 / 0.18), 0 4px 12px rgb(15 42 61 / 0.08)",
  },
  dark: {
    e0: "none",
    e1: "0 1px 2px rgb(0 0 0 / 0.3)",
    e2: "0 8px 24px rgb(0 0 0 / 0.45)",
    e3: "0 24px 48px rgb(0 0 0 / 0.55)",
  },
};

/** DESIGN.md section 7. All durations become 0ms under prefers-reduced-motion. */
export const motion = {
  fast: "120ms",
  base: "180ms",
  slow: "240ms",
  easeStandard: "cubic-bezier(0.2, 0, 0, 1)",
  easeExit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/** DESIGN.md section 8. */
export const density = {
  comfortable: { rowHeight: "44px", cellY: "12px", cellX: "16px", fontSize: "14px" },
  compact: { rowHeight: "32px", cellY: "6px", cellX: "12px", fontSize: "13px" },
} as const;

export type Density = keyof typeof density;
