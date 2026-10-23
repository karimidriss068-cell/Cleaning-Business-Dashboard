import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

// Body font — replaces Inter. Same variable name (--font-sans) so every
// existing font-sans consumer picks it up automatically.
const instrumentSans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

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
    <html
      lang="en"
      className={`dark ${fraunces.variable} ${instrumentSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="ambient-bg" aria-hidden />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
