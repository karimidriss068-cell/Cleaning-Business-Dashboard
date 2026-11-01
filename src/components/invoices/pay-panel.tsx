"use client";

import { useState, useTransition } from "react";
import { CreditCard, Lock } from "lucide-react";
import { toast } from "sonner";
import { startCardSetup, startCheckout } from "@/app/actions/invoices";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GlassPanel } from "@/components/system/glass-panel";

/** The customer's pay choices. Amounts shown are from the database; the server re-derives them when starting Checkout. */
export function PayPanel({ token, depositDueCents, balanceCents }: { token: string; depositDueCents: number; balanceCents: number }) {
  const hasDeposit = depositDueCents > 0 && depositDueCents < balanceCents;
  const [choice, setChoice] = useState<"deposit" | "balance">(hasDeposit ? "deposit" : "balance");
  const [saveCard, setSaveCard] = useState(false);
  const [pending, start] = useTransition();
  const amount = choice === "deposit" ? depositDueCents : balanceCents;

  function pay() {
    start(async () => {
      const r = await startCheckout({ token, choice, saveCard });
      if (r.ok) window.location.assign(r.url);
      else toast.error(r.message);
    });
  }

  return (
    <GlassPanel level="modal" className="space-y-4 p-5" aria-label="Pay this invoice">
      {hasDeposit && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">How much would you like to pay?</legend>
          {(["deposit", "balance"] as const).map((c) => (
            <label key={c} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-sm border border-hairline px-3 has-[:checked]:border-brand/60 has-[:checked]:bg-info-soft">
              <span className="flex items-center gap-2.5">
                <input type="radio" name="choice" value={c} checked={choice === c} onChange={() => setChoice(c)} className="size-4 accent-[var(--kc-accent)]" />
                <span className="text-sm text-ink">{c === "deposit" ? "Deposit" : "Full balance"}</span>
              </span>
              <span className="text-sm font-medium text-ink tabular">{formatCents(c === "deposit" ? depositDueCents : balanceCents)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex items-start gap-2.5">
        <Checkbox id="save-card" checked={saveCard} onCheckedChange={(v) => setSaveCard(v === true)} className="mt-0.5" />
        <Label htmlFor="save-card" className="text-[13px] leading-5 font-normal text-ink-muted">Save this card for future cleans, so it can be charged on the day.</Label>
      </div>
      <Button onClick={pay} disabled={pending || amount <= 0} className="h-12 w-full text-base" data-testid="pay-button">
        <CreditCard aria-hidden /> {pending ? "Opening secure checkout…" : `Pay ${formatCents(amount)}`}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-muted"><Lock className="size-3.5" aria-hidden /> Card details go straight to Stripe. We never see or store them.</p>
    </GlassPanel>
  );
}

export function CardSetupPanel({ token, customer }: { token: string; customer: string }) {
  const [pending, start] = useTransition();
  function go() {
    start(async () => {
      const r = await startCardSetup({ token });
      if (r.ok) window.location.assign(r.url);
      else toast.error(r.message);
    });
  }
  return (
    <GlassPanel level="modal" className="space-y-4 p-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">Save a card{customer ? `, ${customer}` : ""}</h1>
      <p className="text-sm text-ink-muted">Keep a card on file so your cleaning can be charged on the day of the visit. You won&apos;t be charged now.</p>
      <Button onClick={go} disabled={pending} className="h-12 w-full text-base" data-testid="save-card-button">
        <CreditCard aria-hidden /> {pending ? "Opening secure form…" : "Add a card"}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-muted"><Lock className="size-3.5" aria-hidden /> Card details go straight to Stripe. We never see or store them.</p>
    </GlassPanel>
  );
}
