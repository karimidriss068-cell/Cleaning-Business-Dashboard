import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Mohave } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { tokensCss } from "@/lib/theme/tokens-css";
import "./globals.css";

const mohave = Mohave({ variable: "--font-mohave", subsets: ["latin"], display: "swap" });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

// Placeholder title and description until the new brand lands.
export const metadata: Metadata = {
  title: "Cleaning Ops",
  description: "Operations dashboard for a residential and commercial cleaning company in New York City.",
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
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
