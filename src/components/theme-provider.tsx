"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light/dark via a class on <html>; follows the system until the user picks. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
