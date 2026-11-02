import { VaultBackdrop } from "@/components/vault/backdrop";

/**
 * The ambient aurora (three drifting accent blobs + fine grid), behind all
 * content. `quiet` drops the blobs for crew screens, whose text must stay at
 * AAA on the plain canvas. In the Vault direction a light cone and vignette
 * (CSS only) sit over it, and capable desktops also get the lazy 3D depth
 * field (see components/vault/backdrop.tsx).
 */
export function Ambient({ quiet = false }: { quiet?: boolean }) {
  return (
    <div aria-hidden className="kc-ambient">
      {!quiet && (
        <>
          <span className="kc-blob kc-blob-1" />
          <span className="kc-blob kc-blob-2" />
          <span className="kc-blob kc-blob-3" />
          <span className="kc-vault-light" />
          <VaultBackdrop />
          <span className="kc-vault-vignette" />
        </>
      )}
    </div>
  );
}
