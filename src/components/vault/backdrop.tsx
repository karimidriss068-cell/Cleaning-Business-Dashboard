"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

// The 3D scene is a separate chunk that only downloads when this device can
// afford it. Everyone else keeps the CSS-only background (aurora, light cone,
// vignette), which is also what shows before the chunk arrives.
const SceneCanvas = dynamic(() => import("./scene-canvas"), { ssr: false });

type NavExtras = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

function capable(): boolean {
  const root = document.documentElement;
  if (root.dataset.direction !== "vault") return false;
  const mq = (q: string) => window.matchMedia(q).matches;
  if (!mq("(min-width: 1024px)") || !mq("(hover: hover) and (pointer: fine)")) return false;
  if (mq("(prefers-reduced-motion: reduce)") || mq("(prefers-reduced-transparency: reduce)")) return false;
  const nav = navigator as NavExtras;
  if (nav.connection?.saveData) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 4) return false;
  return true;
}

const QUERIES = ["(min-width: 1024px)", "(hover: hover) and (pointer: fine)", "(prefers-reduced-motion: reduce)", "(prefers-reduced-transparency: reduce)"];

function subscribe(cb: () => void) {
  const mqs = QUERIES.map((q) => window.matchMedia(q));
  mqs.forEach((m) => m.addEventListener("change", cb));
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-direction"] });
  return () => {
    mqs.forEach((m) => m.removeEventListener("change", cb));
    mo.disconnect();
  };
}

export function VaultBackdrop() {
  const on = useSyncExternalStore(subscribe, capable, () => false);
  return on ? <SceneCanvas /> : null;
}
