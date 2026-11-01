import { BrandLockup } from "@/components/system/brand-mark";
import { Ambient } from "@/components/system/ambient";

// Customer-facing pages (pay an invoice, save a card). No sign-in, no shell:
// the link's unguessable token is the credential, and nothing here lists or
// searches anything.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Ambient quiet />
      <main className="relative z-10 mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
        <BrandLockup />
        {children}
      </main>
    </div>
  );
}
