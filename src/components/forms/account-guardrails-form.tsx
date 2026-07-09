"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

type FormErrors = Partial<{ cpaAlert: string; autoPause: string }>;

export function AccountGuardrailsForm({
  accountId,
  cpaAlertThreshold,
  autoPauseThreshold,
}: {
  accountId: string;
  cpaAlertThreshold: number | null;
  autoPauseThreshold: number | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [cpaAlert, setCpaAlert] = useState(
    cpaAlertThreshold != null ? String(cpaAlertThreshold) : "",
  );
  const [autoPause, setAutoPause] = useState(
    autoPauseThreshold != null ? String(autoPauseThreshold) : "",
  );
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (cpaAlert && (Number.isNaN(Number(cpaAlert)) || Number(cpaAlert) < 0)) {
      errs.cpaAlert = "Enter a valid non-negative amount.";
    }
    if (autoPause && (Number.isNaN(Number(autoPause)) || Number(autoPause) < 0)) {
      errs.autoPause = "Enter a valid non-negative amount.";
    }
    if (
      !errs.cpaAlert &&
      !errs.autoPause &&
      cpaAlert &&
      autoPause &&
      Number(autoPause) < Number(cpaAlert)
    ) {
      errs.autoPause = "Auto-pause should be ≥ the alert threshold.";
    }
    return errs;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("accounts")
      .update({
        cpa_alert_threshold: cpaAlert ? Number(cpaAlert) : null,
        auto_pause_threshold: autoPause ? Number(autoPause) : null,
      })
      .eq("id", accountId);
    setSaving(false);
    if (error) {
      toast.error("Could not save guardrails", { description: error.message });
      return;
    }
    toast.success("Guardrails saved");
    router.refresh();
  }

  return (
    <form
      onSubmit={save}
      className="flex flex-wrap items-start gap-3 rounded-md border border-border bg-card/40 p-4"
      noValidate
    >
      <div className="space-y-1">
        <Label htmlFor="g-alert" className="text-xs">
          CPA alert ≥
        </Label>
        <Input
          id="g-alert"
          type="number"
          step="0.01"
          value={cpaAlert}
          onChange={(e) => {
            setCpaAlert(e.target.value);
            if (errors.cpaAlert) setErrors((prev) => ({ ...prev, cpaAlert: undefined }));
          }}
          className="w-32"
          placeholder="260.00"
          aria-invalid={!!errors.cpaAlert}
        />
        <FieldError>{errors.cpaAlert}</FieldError>
      </div>
      <div className="space-y-1">
        <Label htmlFor="g-pause" className="text-xs">
          Auto-pause ≥
        </Label>
        <Input
          id="g-pause"
          type="number"
          step="0.01"
          value={autoPause}
          onChange={(e) => {
            setAutoPause(e.target.value);
            if (errors.autoPause) setErrors((prev) => ({ ...prev, autoPause: undefined }));
          }}
          className="w-32"
          placeholder="327.00"
          aria-invalid={!!errors.autoPause}
        />
        <FieldError>{errors.autoPause}</FieldError>
      </div>
      <Button type="submit" size="sm" loading={saving} className="mt-5">
        Save guardrails
      </Button>
    </form>
  );
}
