"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type FormErrors = Partial<{
  name: string;
  price: string;
  cpaAlert: string;
  autoPause: string;
}>;

export function NewAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [name, setName] = useState("");
  const [type, setType] = useState<"internal" | "client">("client");
  const [niche, setNiche] = useState("");
  const [pricingModel, setPricingModel] = useState("per_appointment");
  const [price, setPrice] = useState("327");
  const [cpaAlert, setCpaAlert] = useState("");
  const [autoPause, setAutoPause] = useState("");

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "Name is required.";
    if (price && (Number.isNaN(Number(price)) || Number(price) < 0)) {
      errs.price = "Enter a valid non-negative amount.";
    }
    if (cpaAlert && (Number.isNaN(Number(cpaAlert)) || Number(cpaAlert) < 0)) {
      errs.cpaAlert = "Enter a valid non-negative amount.";
    }
    if (autoPause && (Number.isNaN(Number(autoPause)) || Number(autoPause) < 0)) {
      errs.autoPause = "Enter a valid non-negative amount.";
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
    const { error } = await supabase.from("accounts").insert({
      name: name.trim(),
      type,
      niche: niche.trim() || null,
      pricing_model: pricingModel.trim() || null,
      price_per_appointment: price ? Number(price) : null,
      cpa_alert_threshold: cpaAlert ? Number(cpaAlert) : null,
      auto_pause_threshold: autoPause ? Number(autoPause) : null,
    });
    setSaving(false);

    if (error) {
      toast.error("Could not create account", { description: error.message });
      return;
    }
    toast.success("Account created");
    setOpen(false);
    setName("");
    setNiche("");
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
            <Plus className="h-4 w-4" /> New Account
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="MAKI or client med spa name"
              aria-invalid={!!errors.name}
            />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as "internal" | "client")}
                items={{ internal: "Internal", client: "Client" }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="niche">Niche</Label>
              <Input
                id="niche"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="injectables, laser, med spa memberships…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pricing">Pricing model</Label>
              <Input
                id="pricing"
                value={pricingModel}
                onChange={(e) => setPricingModel(e.target.value)}
                placeholder="per_appointment"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price / consult</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
                }}
                placeholder="327.00"
                aria-invalid={!!errors.price}
              />
              <FieldError>{errors.price}</FieldError>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpa-alert">CPA alert ≥</Label>
              <Input
                id="cpa-alert"
                type="number"
                step="0.01"
                value={cpaAlert}
                onChange={(e) => {
                  setCpaAlert(e.target.value);
                  if (errors.cpaAlert) setErrors((prev) => ({ ...prev, cpaAlert: undefined }));
                }}
                placeholder="260.00"
                aria-invalid={!!errors.cpaAlert}
              />
              <FieldError>{errors.cpaAlert}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-pause">Auto-pause ≥</Label>
              <Input
                id="auto-pause"
                type="number"
                step="0.01"
                value={autoPause}
                onChange={(e) => {
                  setAutoPause(e.target.value);
                  if (errors.autoPause) setErrors((prev) => ({ ...prev, autoPause: undefined }));
                }}
                placeholder="327.00"
                aria-invalid={!!errors.autoPause}
              />
              <FieldError>{errors.autoPause}</FieldError>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" loading={saving}>
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
