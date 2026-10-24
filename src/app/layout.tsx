import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { tokensCss } from "@/lib/theme/tokens-css";
import { directionBootScript } from "@/lib/theme/direction";
import { directionFontClasses } from "@/lib/theme/fonts";
import { DIRECTION_COOKIE, resolveDirection } from "@/lib/theme/preferences";
import { brand, defaultDirection, directions } from "@/config/brand";
import "./globals.css";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The cookie mirrors the member's saved direction, so the server paints the
  // right palette and loads only that direction's fonts on first render.
  const cookie = (await cookies()).get(DIRECTION_COOKIE)?.value;
  const direction = resolveDirection({ cookie });
  return (
    // suppressHydrationWarning: next-themes and the boot script adjust <html> before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      data-direction={direction}
      data-direction-source={cookie ? "cookie" : "default"}
      // Static on purpose: next-themes owns the dark/light class here, and a
      // changing className would make React overwrite it on refresh.
      className="h-full"
    >
      <head>
        {/* Without a cookie, this browser's saved direction is applied before
            first paint; then the design tokens. Both are static strings built
            from src/config/brand.ts (no user input). */}
        <script dangerouslySetInnerHTML={{ __html: directionBootScript() }} />
        <style id="kc-tokens" dangerouslySetInnerHTML={{ __html: tokensCss() }} />
      </head>
      <body className={`${directionFontClasses(direction)} min-h-full flex flex-col`}>
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
