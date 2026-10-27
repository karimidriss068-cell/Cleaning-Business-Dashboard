"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_TYPES, photoPath, validatePhotoFile } from "@/lib/crew";
import { preparePhoto } from "@/lib/image";
import { registerPhoto } from "@/app/actions/crew";
import { Button } from "@/components/ui/button";

type Shown = { id: string; url: string | null };

/**
 * Before or after photos for a visit. Files go straight to the private
 * job-photos bucket as the signed-in cleaner (storage RLS limits them to their
 * own visits; the bucket enforces 10 MB and image types), then the photo is
 * recorded through a validated server action.
 */
export function PhotoSection({ jobId, kind, title, photos: initial, canUpload }: { jobId: string; kind: "before" | "after"; title: string; photos: Shown[]; canUpload: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initial);
  const [busy, setBusy] = useState(0);

  async function upload(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const problem = validatePhotoFile(file);
      if (problem) {
        toast.error("Photo not added", { description: problem });
        continue;
      }
      setBusy((n) => n + 1);
      try {
        const { blob, type } = await preparePhoto(file);
        const again = validatePhotoFile({ type, size: blob.size });
        if (again) throw new Error(again);
        const path = photoPath(jobId, crypto.randomUUID(), type);
        const { error } = await createClient().storage.from("job-photos").upload(path, blob, { contentType: type, upsert: false });
        if (error) throw new Error("The upload failed. Check your connection and try again.");
        const result = await registerPhoto({ jobId, path, kind, contentType: type });
        if (!result.ok) throw new Error(result.message);
        setPhotos((p) => [...p, { id: path, url: URL.createObjectURL(blob) }]);
      } catch (e) {
        toast.error("Photo not added", { description: e instanceof Error ? e.message : "Try again." });
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-xl font-medium text-ink">{title}</h3>
        <span className="text-[15px] text-crew-muted tabular">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
      </div>
      {photos.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li key={p.id} className="aspect-square overflow-hidden rounded-md border border-hairline bg-surface-raised">
              {p.url ? (
                // Signed, short-lived URLs from the private bucket: plain img, no optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={`${title} photo ${i + 1}`} loading="lazy" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center p-2 text-center text-[13px] text-crew-muted">Photo unavailable</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <>
          <input ref={input} type="file" accept={PHOTO_TYPES.join(",")} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files)} data-testid={`photo-input-${kind}`} />
          <Button type="button" variant="secondary" size="crew" loading={busy > 0} onClick={() => input.current?.click()}>
            <Camera />
            {busy > 0 ? "Uploading" : `Add ${kind} photo`}
          </Button>
        </>
      )}
    </div>
  );
}
