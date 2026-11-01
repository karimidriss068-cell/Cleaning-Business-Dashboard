"use client";

import { useState } from "react";
import { saveMessageTemplate } from "@/app/actions/ghl";
import { templateSchema } from "@/lib/schemas/ghl";
import type { TemplateRow } from "@/lib/ghl/status-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";

const WHEN: Record<TemplateRow["key"], string> = {
  instant_reply: "Within 60 seconds of a new lead from GHL. A call-now task is created for you either way.",
  booking_confirmation: "Right after a visit is booked.",
  reminder_24h: "The day before a visit.",
  review_request: "2 hours after a visit is marked complete.",
  payment_link: "When an invoice is sent and not yet paid.",
};

function TemplateCard({ template }: { template: TemplateRow }) {
  const { run, pending } = useFinanceAction();
  const [body, setBody] = useState(template.body);
  const [mode, setMode] = useState(template.mode);
  const [armed, setArmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const goingLive = mode === "live" && template.mode !== "live";

  function save() {
    const input = { key: template.key, body, mode };
    const parsed = templateSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    if (goingLive && !armed) return setArmed(true);
    setArmed(false);
    run(() => saveMessageTemplate(input), mode === "live" ? "Live: real texts will go out" : "Saved (dry run)");
  }

  return (
    <li className="space-y-3 rounded-sm border border-hairline p-4" data-testid={`template-${template.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-base font-medium text-ink">{template.label}</h3>
          <p className="text-[12px] text-ink-muted">{WHEN[template.key]}</p>
        </div>
        <StatusPill tone={template.mode === "live" ? "warning" : "info"}>{template.mode === "live" ? "Live" : "Dry run"}</StatusPill>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`tpl-${template.key}`}>Message</Label>
        <Textarea id={`tpl-${template.key}`} value={body} onChange={(e) => { setBody(e.target.value); setArmed(false); }} aria-invalid={Boolean(errors.body)} />
        {errors.body ? <p role="alert" className="text-[12px] text-danger">{errors.body}</p> : <p className="text-[12px] text-ink-muted">You can use {"{{first_name}}"}, {"{{business}}"}, {"{{when}}"} and {"{{pay_link}}"}. A live message must say people can reply STOP.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label={`${template.label} mode`} className="flex gap-2">
          {(["dry_run", "live"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => { setMode(m); setArmed(false); }}
              className={`h-11 rounded-sm border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 ${mode === m ? "border-brand bg-highlight text-ink" : "border-hairline text-ink-muted"}`}
            >
              {m === "dry_run" ? "Dry run" : "Live"}
            </button>
          ))}
        </div>
        <Button type="button" onClick={save} disabled={pending} className="h-11 md:h-9" data-testid={`save-template-${template.key}`}>
          {armed ? "Confirm: text real customers" : goingLive ? "Go live" : "Save"}
        </Button>
      </div>
      {armed && <p role="alert" className="text-[12px] text-warning">Live sends real texts to customers who agreed to them, between 8am and 9pm New York. Press again to confirm.</p>}
    </li>
  );
}

/** Edit each text and switch it between dry-run (logs what it would send) and live. Everything starts in dry-run. */
export function TemplatesPanel({ templates }: { templates: TemplateRow[] }) {
  return (
    <GlassPanel as="section" aria-labelledby="ghl-templates" className="kc-enter space-y-4 p-5" data-testid="ghl-templates">
      <div>
        <h2 id="ghl-templates" className="font-heading text-lg font-medium text-ink">Automated texts</h2>
        <p className="text-[13px] text-ink-muted">Dry run writes what it would send to the log and sends nothing. Texts only go to customers with consent on file who haven&apos;t replied STOP, never between 9pm and 8am.</p>
      </div>
      <ul className="grid gap-4 lg:grid-cols-2">{templates.map((t) => <TemplateCard key={t.key} template={t} />)}</ul>
    </GlassPanel>
  );
}
