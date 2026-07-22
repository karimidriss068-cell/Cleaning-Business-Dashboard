"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
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

const TYPES = { video: "Video", image: "Image", script: "Script", vsl: "VSL" };
const STATUSES = {
  testing: "Testing",
  winning: "Winning",
  retired: "Retired",
};

type FormErrors = Partial<{ name: string; accountId: string }>;

export function NewCreativeDialog({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [type, setType] = useState<keyof typeof TYPES>("video");
  const [status, setStatus] = useState<keyof typeof STATUSES>("testing");
  const [notes, setNotes] = useState("");

  const accountItems = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "Name is required.";
    if (!accountId) errs.accountId = "Create an account first, then select one.";
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
    const { error } = await supabase.from("creatives").insert({
      name: name.trim(),
      account_id: accountId,
      type,
      status,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast.error("Could not create creative", { description: error.message });
      return;
    }
    toast.success("Creative created");
    setOpen(false);
    setName("");
    setNotes("");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setErrors({});
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> New Creative
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New creative</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="cr-name">Name</Label>
            <Input
              id="cr-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="Before/after Botox hook v3"
              aria-invalid={!!errors.name}
            />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div className="space-y-2">
            <Label>Account</Label>
            <Select
              value={accountId}
              onValueChange={(v) => {
                setAccountId(v as string);
                if (errors.accountId) setErrors((prev) => ({ ...prev, accountId: undefined }));
              }}
              items={accountItems}
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.accountId}>
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
            <FieldError>{errors.accountId}</FieldError>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as keyof typeof TYPES)}
                items={TYPES}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPES).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as keyof typeof STATUSES)}
                items={STATUSES}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUSES).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-notes">Notes</Label>
            <Textarea
              id="cr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Hook, angle, editing notes…"
            />
          </div>
          <DialogFooter>
            <Button type="submit" loading={saving}>
              Create creative
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
