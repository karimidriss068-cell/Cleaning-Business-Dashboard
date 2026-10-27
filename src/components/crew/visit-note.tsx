"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { saveVisitNote } from "@/app/actions/crew";

/** The cleaner's own note on this visit (only they and the office can read it). */
export function VisitNote({ jobId, initial, editable }: { jobId: string; initial: string; editable: boolean }) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (note === saved) return;
    setSaving(true);
    const result = await saveVisitNote({ jobId, note });
    setSaving(false);
    if (result.ok) {
      setSaved(note);
      toast.success("Note saved");
    } else toast.error("Note not saved", { description: result.message });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        disabled={!editable}
        maxLength={2000}
        aria-label="Your notes for this visit"
        placeholder="Anything the office should know: pets, damage, supplies running low…"
        className="min-h-28 text-[17px]"
      />
      {editable && (
        <Button type="button" variant="secondary" size="crew" onClick={save} loading={saving} disabled={note === saved}>
          {note === saved ? "Saved" : "Save note"}
        </Button>
      )}
    </div>
  );
}
