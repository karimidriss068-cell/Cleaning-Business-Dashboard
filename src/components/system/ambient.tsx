/**
 * The ambient aurora (three drifting accent blobs + fine grid), behind all
 * content. `quiet` drops the blobs for crew screens, whose text must stay at
 * AAA on the plain canvas. In the Vault direction the grid is hidden, the
 * blobs drift very slowly over a warm umber gradient (CSS only; nothing
 * extra to load or run), which is also the whole fallback on phones.
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
