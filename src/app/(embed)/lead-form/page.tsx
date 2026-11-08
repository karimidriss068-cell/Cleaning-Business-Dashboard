import type { Metadata } from "next";
import { LeadForm } from "@/components/intake/lead-form";
import { GlassPanel } from "@/components/system/glass-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request a commercial cleaning bid", robots: { index: false, follow: false } };

/** The embeddable lead form. The Turnstile site key is public by design; the secret never leaves the server. */
export default function LeadFormPage() {
  // Read by name at run time (not inlined at build), so the key can be set per deployment.
  const siteKey = process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] || null;
  const live = process.env.NODE_ENV !== "production" || (siteKey && process.env.TURNSTILE_SECRET_KEY && process.env.INTAKE_IP_SALT);
  if (!live) {
    return (
      <GlassPanel level="card" className="space-y-2 p-6 text-center">
        <h1 className="font-heading text-xl font-semibold text-ink">Request a commercial cleaning bid</h1>
        <p className="text-sm text-ink-muted">This form isn&apos;t available right now. Please call us and we&apos;ll help you directly.</p>
      </GlassPanel>
    );
  }
  return <LeadForm siteKey={siteKey} />;
}
