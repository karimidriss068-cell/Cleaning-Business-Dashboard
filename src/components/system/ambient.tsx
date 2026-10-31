/**
 * The ambient aurora (three drifting accent blobs + fine grid), behind all
 * content. `quiet` drops the blobs for crew screens, whose text must stay at
 * AAA on the plain canvas.
 */
export function Ambient({ quiet = false }: { quiet?: boolean }) {
  return (
    <div aria-hidden className="kc-ambient">
      {!quiet && (
        <>
          <span className="kc-blob kc-blob-1" />
          <span className="kc-blob kc-blob-2" />
          <span className="kc-blob kc-blob-3" />
        </>
      )}
    </div>
  );
}
