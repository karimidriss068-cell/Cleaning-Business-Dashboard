// Pages that other websites show inside an iframe. No brand lockup or shell (the host site has
// its own), and nothing here lists or searches anything.
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-xl px-4 py-4">{children}</main>;
}
