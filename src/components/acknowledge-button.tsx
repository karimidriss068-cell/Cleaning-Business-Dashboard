"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function acknowledge() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("alerts")
      .update({ acknowledged: true })
      .eq("id", alertId);
    setBusy(false);
    if (error) {
      toast.error("Could not acknowledge", { description: error.message });
      return;
    }
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={acknowledge} disabled={busy}>
      {busy ? "…" : "Acknowledge"}
    </Button>
  );
}
