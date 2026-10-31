/** The ambient aurora (three drifting accent blobs + fine grid), behind all content. */
export function Ambient() {
  return (
    <div aria-hidden className="kc-ambient">
      <span className="kc-blob kc-blob-1" />
      <span className="kc-blob kc-blob-2" />
      <span className="kc-blob kc-blob-3" />
    </div>
  );
}
