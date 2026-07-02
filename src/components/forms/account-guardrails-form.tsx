"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
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
      className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card/40 p-4"
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
          onChange={(e) => setCpaAlert(e.target.value)}
          className="w-32"
          placeholder="260.00"
        />
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
          onChange={(e) => setAutoPause(e.target.value)}
          className="w-32"
          placeholder="327.00"
        />
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save guardrails"}
      </Button>
    </form>
  );
}
