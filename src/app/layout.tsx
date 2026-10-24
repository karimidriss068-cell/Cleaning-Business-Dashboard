import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Mohave } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { tokensCss } from "@/lib/theme/tokens-css";
import { brand, palettes } from "@/config/brand";
import "./globals.css";

const mohave = Mohave({ variable: "--font-mohave", subsets: ["latin"], display: "swap" });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

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
    { media: "(prefers-color-scheme: light)", color: palettes.light.canvas },
    { media: "(prefers-color-scheme: dark)", color: palettes.dark.canvas },
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
      className={`${mohave.variable} ${dmSans.variable} ${dmMono.variable} h-full`}
    >
      <head>
        {/* Design tokens from src/config/brand.ts (static, no user input). */}
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
