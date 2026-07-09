"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function SyncMetaButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    const res = await fetch("/api/meta/sync", { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      toast.error("Meta sync failed", { description: data?.error });
      return;
    }
    const unmapped = data.unmappedMetaCampaigns?.length ?? 0;
    toast.success(`Synced ${data.rowsWritten} spend row(s) from Meta`, {
      description:
        unmapped > 0
          ? `${unmapped} Meta campaign(s) have no local mapping and were skipped.`
          : undefined,
    });
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      className="gap-2"
      loading={busy}
      onClick={sync}
    >
      {!busy && <RefreshCw className="h-3.5 w-3.5" />}
      Sync Meta spend
    </Button>
  );
}
