"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddSpendForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [spend, setSpend] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || spend === "") {
      toast.error("Date and spend are required");
      return;
    }
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
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/40 p-4"
    >
      <div className="space-y-1">
        <Label htmlFor="s-date" className="text-xs">
          Date
        </Label>
        <Input
          id="s-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
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
          onChange={(e) => setSpend(e.target.value)}
          className="w-28"
          placeholder="0.00"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="s-impr" className="text-xs">
          Impressions
        </Label>
        <Input
          id="s-impr"
          type="number"
          value={impressions}
          onChange={(e) => setImpressions(e.target.value)}
          className="w-28"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="s-clicks" className="text-xs">
          Clicks
        </Label>
        <Input
          id="s-clicks"
          type="number"
          value={clicks}
          onChange={(e) => setClicks(e.target.value)}
          className="w-24"
        />
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Adding…" : "Add spend entry"}
      </Button>
    </form>
  );
}
