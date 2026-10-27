/**
 * Prepares a phone photo for upload: scales anything over 2000px down and
 * re-encodes it as JPEG so uploads are fast on mobile data and stay well under
 * the 10 MB limit. If the browser can't decode it (some HEIC), the original is
 * uploaded unchanged.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; type: string }> {
  const MAX = 2000;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000 && file.type === "image/jpeg") {
      bitmap.close();
      return { blob: file, type: file.type };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? { blob, type: "image/jpeg" } : { blob: file, type: file.type };
  } catch {
    return { blob: file, type: file.type };
  }
}
