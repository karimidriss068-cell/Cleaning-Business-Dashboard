"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CreativeOption = { id: string; name: string };

export function AttachCreativeForm({
  campaignId,
  options,
}: {
  campaignId: string;
  options: CreativeOption[];
}) {
  const router = useRouter();
  const [creativeId, setCreativeId] = useState("");
  const [saving, setSaving] = useState(false);

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unattached creatives for this account. Add creatives in the Creatives
        library first.
      </p>
    );
  }

  const items = Object.fromEntries(options.map((o) => [o.id, o.name]));

  async function attach() {
    if (!creativeId) {
      toast.error("Pick a creative to attach");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("campaign_creatives")
      .insert({ campaign_id: campaignId, creative_id: creativeId });
    setSaving(false);

    if (error) {
      toast.error("Could not attach creative", { description: error.message });
      return;
    }
    toast.success("Creative attached");
    setCreativeId("");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Select
        value={creativeId}
        onValueChange={(v) => setCreativeId(v as string)}
        items={items}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a creative…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="secondary" onClick={attach} disabled={saving}>
        {saving ? "Attaching…" : "Attach"}
      </Button>
    </div>
  );
}
