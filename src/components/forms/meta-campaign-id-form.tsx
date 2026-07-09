"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MetaCampaignIdForm({
  campaignId,
  metaCampaignId,
}: {
  campaignId: string;
  metaCampaignId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(metaCampaignId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("campaigns")
      .update({ meta_campaign_id: value.trim() || null })
      .eq("id", campaignId);
    setSaving(false);
    if (error) {
      toast.error("Could not save Meta campaign ID", { description: error.message });
      return;
    }
    toast.success("Meta campaign ID saved");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/40 p-4">
      <div className="space-y-1">
        <Label htmlFor="meta-campaign-id" className="text-xs">
          Meta campaign ID
        </Label>
        <Input
          id="meta-campaign-id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 120211234567890"
          className="w-64"
        />
      </div>
      <Button size="sm" loading={saving} onClick={save}>
        Save mapping
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Maps this campaign to a Meta campaign so "Sync Meta spend" can write its
        daily numbers here automatically.
      </p>
    </div>
  );
}
