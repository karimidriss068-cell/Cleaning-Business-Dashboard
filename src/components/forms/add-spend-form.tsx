"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

type FormErrors = Partial<{
  date: string;
  spend: string;
  impressions: string;
  clicks: string;
}>;

export function AddSpendForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [spend, setSpend] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!date) errs.date = "Date is required.";
    if (spend === "") {
      errs.spend = "Spend is required.";
    } else if (Number.isNaN(Number(spend)) || Number(spend) < 0) {
      errs.spend = "Enter a valid non-negative amount.";
    }
    if (impressions && (Number.isNaN(Number(impressions)) || Number(impressions) < 0)) {
      errs.impressions = "Enter a valid non-negative number.";
    }
    if (clicks && (Number.isNaN(Number(clicks)) || Number(clicks) < 0)) {
      errs.clicks = "Enter a valid non-negative number.";
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("spend_daily").insert({
      campaign_id: campaignId,
      date,
      spend: Number(spend),
      impressions: impressions ? Number(impressions) : null,
      clicks: clicks ? Number(clicks) : null,
      source: "manual",
    });
    setSaving(false);

    if (error) {
      toast.error("Could not add spend", { description: error.message });
      return;
    }
    toast.success("Spend entry added");
    setDate("");
    setSpend("");
    setImpressions("");
    setClicks("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card/40 p-4"
      noValidate
    >
      <div className="space-y-1">
        <Label htmlFor="s-date" className="text-xs">
          Date
        </Label>
        <Input
          id="s-date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
          }}
          className="w-40"
          aria-invalid={!!errors.date}
        />
        <FieldError>{errors.date}</FieldError>
      </div>
      <div className="space-y-1">
        <Label htmlFor="s-spend" className="text-xs">
          Spend
        </Label>
        <Input
          id="s-spend"
          type="number"
          step="0.01"
          value={spend}
          onChange={(e) => {
            setSpend(e.target.value);
            if (errors.spend) setErrors((prev) => ({ ...prev, spend: undefined }));
          }}
          className="w-28"
          placeholder="0.00"
          aria-invalid={!!errors.spend}
        />
        <FieldError>{errors.spend}</FieldError>
      </div>
      <div className="space-y-1">
        <Label htmlFor="s-impr" className="text-xs">
          Impressions
        </Label>
        <Input
          id="s-impr"
          type="number"
          value={impressions}
          onChange={(e) => {
            setImpressions(e.target.value);
            if (errors.impressions) setErrors((prev) => ({ ...prev, impressions: undefined }));
          }}
          className="w-28"
          aria-invalid={!!errors.impressions}
        />
        <FieldError>{errors.impressions}</FieldError>
      </div>
      <div className="space-y-1">
        <Label htmlFor="s-clicks" className="text-xs">
          Clicks
        </Label>
        <Input
          id="s-clicks"
          type="number"
          value={clicks}
          onChange={(e) => {
            setClicks(e.target.value);
            if (errors.clicks) setErrors((prev) => ({ ...prev, clicks: undefined }));
          }}
          className="w-24"
          aria-invalid={!!errors.clicks}
        />
        <FieldError>{errors.clicks}</FieldError>
      </div>
      <Button type="submit" size="sm" loading={saving} className="mt-5">
        Add spend entry
      </Button>
    </form>
  );
}
