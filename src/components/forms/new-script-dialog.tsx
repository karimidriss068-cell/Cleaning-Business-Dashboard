"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CHANNEL_LABELS } from "@/lib/outreach";
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

const STATUSES = { testing: "Testing", winning: "Winning", retired: "Retired" };

type FormErrors = Partial<{ name: string }>;

export function NewScriptDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [name, setName] = useState("");
  const [channel, setChannel] =
    useState<keyof typeof CHANNEL_LABELS>("sms");
  const [status, setStatus] = useState<keyof typeof STATUSES>("testing");
  const [content, setContent] = useState("");

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "Name is required.";
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
    const { error } = await supabase.from("outreach_scripts").insert({
      name: name.trim(),
      channel,
      status,
      content: content.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not create script", { description: error.message });
      return;
    }
    toast.success("Script created");
    setOpen(false);
    setName("");
    setContent("");
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
            <Plus className="h-4 w-4" /> New Script
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New outreach script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="sc-name">Name</Label>
            <Input
              id="sc-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="Pain-point opener v2"
              aria-invalid={!!errors.name}
            />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={channel}
                onValueChange={(v) =>
                  setChannel(v as keyof typeof CHANNEL_LABELS)
                }
                items={CHANNEL_LABELS}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([v, label]) => (
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
            <Label htmlFor="sc-content">Script / hook</Label>
            <Textarea
              id="sc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="The actual opener or hook, for reference…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button type="submit" loading={saving}>
              Create script
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
