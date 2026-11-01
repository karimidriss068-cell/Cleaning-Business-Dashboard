// Print pages sit outside the app shell: just the document, on a plain light sheet.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl px-4 py-6 print:max-w-none print:p-0">{children}</main>;
}
