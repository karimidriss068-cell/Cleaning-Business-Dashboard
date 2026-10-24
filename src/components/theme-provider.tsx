"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light/dark via a class on <html>. Dark-first: dark until the user picks. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
