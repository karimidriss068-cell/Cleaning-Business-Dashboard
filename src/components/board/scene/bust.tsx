"use client";

import { useEffect, useState } from "react";
import { PORTRAIT_SHAPES, portraitSrc, type PortraitShape } from "@/lib/board/scene/portraits";
import { cn } from "@/lib/utils";
import type { AvatarWho, NodeState } from "@/components/board/scene/glyphs";

/** Drives the mouth/eyes like the original Roast Room: idle blinks every 2.4–6.6s, speaking flaps open/mid, thinking holds mid with blinks. */
export function useBustShape(state: NodeState): PortraitShape {
  const [shape, setShape] = useState<PortraitShape>("base");
  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(() => alive && fn(), ms));
    if (state === "speaking") {
      const seq: PortraitShape[] = ["open", "mid", "base", "open", "mid", "open", "base", "mid"];
      let i = 0;
      const tick = () => { setShape(seq[i++ % seq.length]); later(tick, 90 + Math.random() * 90); };
      later(tick, 0);
    } else {
      const rest: PortraitShape = state === "thinking" ? "mid" : "base";
      later(() => setShape(rest), 0);
      const blink = () => { setShape("blink"); later(() => setShape(rest), 130); later(blink, (state === "thinking" ? 1400 : 2400) + Math.random() * 4200); };
      later(blink, 600 + Math.random() * 2400);
    }
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [state]);
  return shape;
}

/** Stacked talking portrait: four frames, one visible at a time (opacity swap, no reflow). */
export function Bust({ who, state = "idle", className, alt }: { who: AvatarWho; state?: NodeState; className?: string; alt?: string }) {
  const shape = useBustShape(state);
  return (
    <span role="img" aria-label={alt} data-shape={shape} data-state={state}
      className={cn("kc-bust relative block aspect-square", state === "speaking" ? "kc-bust-talk" : "kc-bust-breathe", className)}>
      {PORTRAIT_SHAPES.map((s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={s} src={portraitSrc(who, s)} alt="" draggable={false} className={cn("pointer-events-none absolute inset-0 size-full select-none object-contain", s === shape ? "opacity-100" : "opacity-0")} />
      ))}
    </span>
  );
}

/** Same frames inside an SVG (Style B draws its whole stage in one SVG). Centred on (0,0), radius r. */
export function BustSvg({ who, state = "idle", r }: { who: AvatarWho; state?: NodeState; r: number }) {
  const shape = useBustShape(state);
  return (
    <g data-shape={shape}>
      {PORTRAIT_SHAPES.map((s) => (
        <image key={s} href={portraitSrc(who, s)} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" opacity={s === shape ? 1 : 0} />
      ))}
    </g>
  );
}
