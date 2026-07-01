"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

type AccountOption = { id: string; name: string };

export function NewCampaignDialog({
  accounts,
  defaultAccountId,
}: {
  accounts: AccountOption[];
  defaultAccountId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [platform, setPlatform] = useState<"meta" | "google" | "other">("meta");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [ghlTag, setGhlTag] = useState("");

  const accountItems = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) {
      toast.error("Create an account first");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("campaigns").insert({
      name: name.trim(),
      account_id: accountId,
      platform,
      objective: objective.trim() || null,
      budget_daily: budget ? Number(budget) : null,
      start_date: startDate || null,
      ghl_campaign_tag: ghlTag.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast.error("Could not create campaign", { description: error.message });
      return;
    }
    toast.success("Campaign created");
    setOpen(false);
    setName("");
    setObjective("");
    setBudget("");
    setGhlTag("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Roofing — cold traffic Q3"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                value={accountId}
                onValueChange={(v) => setAccountId(v as string)}
                items={accountItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select
                value={platform}
                onValueChange={(v) =>
                  setPlatform(v as "meta" | "google" | "other")
                }
                items={{ meta: "Meta", google: "Google", other: "Other" }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">Meta</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-obj">Objective</Label>
              <Input
                id="c-obj"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Lead gen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-budget">Daily budget</Label>
              <Input
                id="c-budget"
                type="number"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="50.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-start">Start date</Label>
              <Input
                id="c-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-ghl">GHL campaign tag</Label>
              <Input
                id="c-ghl"
                value={ghlTag}
                onChange={(e) => setGhlTag(e.target.value)}
                placeholder="for n8n lead mapping"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim() || !accountId}>
              {saving ? "Saving…" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
