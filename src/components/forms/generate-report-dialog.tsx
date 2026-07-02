"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createReportShare } from "@/app/(app)/accounts/[id]/report-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileText, Copy, ExternalLink } from "lucide-react";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export function GenerateReportDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setUrl(null);
    const res = await createReportShare({ accountId, from, to });
    setBusy(false);
    if ("error" in res) {
      toast.error("Could not create report", { description: res.error });
      return;
    }
    setUrl(`${window.location.origin}/reports/${res.token}`);
    toast.success("Shareable report created (valid 30 days)");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setUrl(null);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="secondary" className="gap-2">
            <FileText className="h-4 w-4" /> Generate Report
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate client report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r-from">From</Label>
              <Input
                id="r-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-to">To</Label>
              <Input
                id="r-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          {url && (
            <div className="space-y-2 rounded-md border border-border bg-card/40 p-3">
              <p className="text-xs text-muted-foreground">
                Read-only link (expires in 30 days):
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={url} className="text-xs" />
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <a href={url} target="_blank" rel="noreferrer">
                  <Button size="icon-sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={generate} disabled={busy}>
            {busy ? "Generating…" : url ? "Regenerate" : "Create report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
