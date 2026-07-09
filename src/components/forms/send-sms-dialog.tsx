"use client";

import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
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
import { MessageSquare, CircleCheck } from "lucide-react";

export function SendSmsDialog({
  ghlContactId,
  contactName,
}: {
  ghlContactId: string;
  contactName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function send() {
    if (!message.trim()) {
      setError("Message can't be empty.");
      return;
    }
    setError(undefined);
    setBusy(true);
    const res = await fetch("/api/ghl/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ghlContactId, message }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not send SMS", { description: data?.error });
      return;
    }
    toast.success("SMS sent");
    setSent(true);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setMessage("");
    }, 700);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSent(false);
          setError(undefined);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="secondary" className="gap-2">
            <MessageSquare className="h-3.5 w-3.5" /> Text
          </Button>
        }
      />
      <DialogContent>
        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-3 py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.05 }}
              >
                <CircleCheck className="h-10 w-10 text-[var(--success)]" />
              </motion.div>
              <p className="text-sm text-muted-foreground">Sent</p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <DialogHeader>
                <DialogTitle>Send SMS{contactName ? ` to ${contactName}` : ""}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="sms-message">Message</Label>
                <Textarea
                  id="sms-message"
                  rows={4}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (error) setError(undefined);
                  }}
                  placeholder="Type your message…"
                  aria-invalid={!!error}
                />
                <FieldError>{error}</FieldError>
              </div>
              <DialogFooter>
                <Button onClick={send} loading={busy}>
                  Send
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
