import type { Metadata, Viewport } from "next";
import { DM_Mono, Figtree, IBM_Plex_Sans, Manrope, Sora, Syne, Unbounded } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { tokensCss } from "@/lib/theme/tokens-css";
import { directionBootScript } from "@/lib/theme/direction";
import { brand, defaultDirection, directions } from "@/config/brand";
import "./globals.css";

// One display + body pairing per visual direction (brand.ts). All three load
// while the owner compares; drop the unused pairs once a direction is chosen.
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], display: "swap" });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap" });
const syne = Syne({ variable: "--font-syne", subsets: ["latin"], display: "swap" });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });
const fontVariables = [sora, manrope, unbounded, figtree, syne, plexSans, dmMono].map((f) => f.variable).join(" ");

// Internal, signed-in operations app: not for search engines.
export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  robots: { index: false, follow: false },
  openGraph: { title: brand.name, description: brand.description, siteName: brand.name, type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: directions[defaultDirection].palettes.light.canvas },
    { media: "(prefers-color-scheme: dark)", color: directions[defaultDirection].palettes.dark.canvas },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontVariables} h-full`}
    >
      <head>
        {/* Visual direction before first paint, then the design tokens; both
            are static strings built from src/config/brand.ts (no user input). */}
        <script dangerouslySetInnerHTML={{ __html: directionBootScript() }} />
        <style id="kc-tokens" dangerouslySetInnerHTML={{ __html: tokensCss() }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
