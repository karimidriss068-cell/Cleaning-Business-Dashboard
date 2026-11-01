import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { getMember } from "@/lib/member";
import { loadCrewPay } from "@/lib/crew-data";
import { formatCalendarDate, formatCents, formatNyDate } from "@/lib/format";
import { weekLabel } from "@/lib/payouts";
import { payoutTone } from "@/lib/status";
import { AnimatedNumber } from "@/components/system/animated-number";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";

export const metadata: Metadata = { title: "My pay" };
export const dynamic = "force-dynamic";

/** The cleaner's own pay history: weekly batches the office has approved or paid. */
export default async function MyPayPage() {
  const { supabase } = await getMember();
  const pay = await loadCrewPay(supabase);

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-6">
      <header className="kc-enter space-y-3">
        <Link href="/my-jobs" className="inline-flex min-h-12 items-center gap-2 text-[17px] text-ink underline underline-offset-4">
          <ArrowLeft className="size-5" aria-hidden /> My jobs
        </Link>
        <h1 className="font-heading text-[34px] leading-10 font-semibold tracking-[-0.01em] text-ink">My pay</h1>
      </header>

      <section aria-label="Paid so far this year" className="kc-enter rounded-lg border glass-solid p-5 shadow-e1" style={{ "--i": 1 } as React.CSSProperties}>
        <p className="text-[13px] font-semibold tracking-[0.14em] text-crew-muted uppercase">Paid so far this year</p>
        <p className="mt-1 font-heading text-[44px] leading-[52px] font-semibold text-ink tabular">
          <AnimatedNumber value={pay.ytd_paid_cents} kind="cents" />
        </p>
      </section>

      {pay.payouts.length === 0 ? (
        <div className="rounded-lg border glass-solid shadow-e1 [&_p]:text-crew-muted">
          <EmptyState icon={Wallet} title="No pay to show yet">Your weekly pay shows up here once the office has approved it.</EmptyState>
        </div>
      ) : (
        <ul className="space-y-4">
          {pay.payouts.map((p, i) => (
            <li key={p.period_start} className="kc-enter rounded-lg border glass-solid p-5 shadow-e1" style={{ "--i": i + 2 } as React.CSSProperties}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-semibold text-ink">{weekLabel(p.period_start)}</h2>
                  <p className="text-[15px] text-crew-muted tabular">{p.status === "paid" && p.paid_at ? `Paid ${formatNyDate(p.paid_at, "short")}` : "Approved, payment on its way"}</p>
                </div>
                <StatusPill tone={payoutTone(p.status)}>{p.status === "paid" ? "Paid" : "Approved"}</StatusPill>
              </div>
              <p className="mt-3 font-heading text-[32px] leading-10 font-semibold text-ink tabular">{formatCents(p.total_cents)}</p>
              <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                {p.items.map((it, n) => (
                  <li key={n} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[17px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{it.service}</span>
                      <span className="text-[14px] text-crew-muted tabular">{formatCalendarDate(it.job_date)}</span>
                    </span>
                    <span className="font-medium text-ink tabular">{formatCents(it.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
