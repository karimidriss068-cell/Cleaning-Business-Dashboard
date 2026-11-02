import type { AdvisorKey } from "@/lib/board/advisors";
import { cn } from "@/lib/utils";

// Original characters for the boardroom: geometric mascots, one silhouette and accessory per lens,
// drawn here from simple shapes. They are not people and are not based on anyone; there are no
// portraits and no brand assets. Colors come from the design tokens (--char is set per tone in
// globals.css); the face uses the canvas and ink tokens so it reads in every direction and theme.

export type AvatarState = "idle" | "thinking" | "speaking";
export type AvatarWho = AdvisorKey | "chair";

const TONE: Record<AvatarWho, string> = {
  cash_ruin: "kc-tone-0", offers_pricing: "kc-tone-1", operations: "kc-tone-2", strategy: "kc-tone-4",
  marketing: "kc-tone-5", hiring: "kc-tone-6", leverage: "kc-tone-3", contrarian: "kc-tone-7", chair: "kc-tone-chair",
};

const body = "fill-(--char)";
const mark = "fill-canvas";
const markStroke = "stroke-canvas";

function Head({ who }: { who: AvatarWho }) {
  switch (who) {
    case "cash_ruin": return <path className={body} d="M50 20 L77 29 V52 C77 68 65 77 50 83 C35 77 23 68 23 52 V29 Z" />;
    case "offers_pricing": return <rect className={body} x="23" y="26" width="54" height="56" rx="15" />;
    case "operations": return <path className={body} d="M50 19 L77 34 V66 L50 81 L23 66 V34 Z" />;
    case "strategy": return <path className={body} d="M50 17 L85 50 L50 85 L15 50 Z" />;
    case "marketing": return <circle className={body} cx="50" cy="51" r="31" />;
    case "hiring": return <circle className={body} cx="50" cy="51" r="30" />;
    case "leverage": return <rect className={body} x="21" y="22" width="58" height="60" rx="22" />;
    case "contrarian": return <rect className={body} x="23" y="27" width="54" height="54" rx="16" />;
    case "chair": return <rect className={body} x="19" y="24" width="62" height="58" rx="24" />;
  }
}

/** Accessory drawn around the head and on the chest: what makes each lens recognisable. */
function Accessory({ who }: { who: AvatarWho }) {
  switch (who) {
    case "cash_ruin":
      return <g><circle className={mark} cx="50" cy="106" r="8" /><path className={markStroke} d="M46 106 H54 M50 102 V110" strokeWidth="2" strokeLinecap="round" fill="none" /></g>;
    case "offers_pricing":
      return <g><circle className={mark} cx="50" cy="31" r="3.4" /><circle className={mark} cx="43" cy="106" r="3.2" /><circle className={mark} cx="57" cy="112" r="3.2" /><path className={markStroke} d="M58 101 L42 117" strokeWidth="2.4" strokeLinecap="round" fill="none" /></g>;
    case "operations":
      return <g><circle cx="50" cy="12" r="7" className="fill-none stroke-(--char)" strokeWidth="5" strokeDasharray="3.4 3.1" /><circle className={mark} cx="50" cy="106" r="7" /><circle className="fill-(--char)" cx="50" cy="106" r="2.6" /></g>;
    case "strategy":
      return <g><circle className={mark} cx="50" cy="106" r="9" /><path className="fill-(--char)" d="M50 98 L54 108 L50 106 L46 108 Z" /></g>;
    case "marketing":
      return <g><path className={body} d="M79 44 L96 35 V67 L79 58 Z" /><path className="fill-none stroke-(--char)" d="M100 44 Q104 51 100 58 M104 40 Q111 51 104 62" strokeWidth="2" strokeLinecap="round" /><path className={mark} d="M44 100 h12 l6 -4 v20 l-6 -4 h-12 Z" /></g>;
    case "hiring":
      return <g><circle className={body} cx="19" cy="52" r="7" /><circle className={body} cx="81" cy="52" r="7" /><circle className={mark} cx="50" cy="106" r="8.5" /><path className={markStroke} d="M50 100 V106 L55 108" strokeWidth="2" strokeLinecap="round" fill="none" /></g>;
    case "leverage":
      return <g><path className="stroke-(--char)" d="M30 16 L72 8" strokeWidth="4" strokeLinecap="round" /><path className="fill-(--char)" d="M46 17 L56 17 L51 9 Z" transform="translate(-1 3)" /><path className={markStroke} d="M40 110 H60 M50 110 V100" strokeWidth="2.4" strokeLinecap="round" fill="none" /></g>;
    case "contrarian":
      return <g><path className={body} d="M29 31 L24 12 L43 26 Z" /><path className={body} d="M71 31 L76 12 L57 26 Z" /><path className={mark} d="M53 98 L44 108 H50 L47 118 L57 106 H51 Z" /></g>;
    case "chair":
      return <g><path className={markStroke} d="M38 100 H62 M50 100 V116 M42 116 H58" strokeWidth="2.4" strokeLinecap="round" fill="none" /><path className={markStroke} d="M38 100 L34 108 H42 Z M62 100 L58 108 H66 Z" strokeWidth="1.6" strokeLinejoin="round" fill="none" /></g>;
  }
}

/** One character. `state` shows who is talking (glow and a moving mouth) or thinking (dots). */
export function Avatar({ who, state = "idle", index = 0, className, title }: { who: AvatarWho; state?: AvatarState; index?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="-6 0 112 124" role="img" aria-label={title ?? "Advisor"} className={cn("block overflow-visible", TONE[who], state === "speaking" && "kc-speaking", className)} data-state={state} style={{ "--i": index } as React.CSSProperties}>
      <g className="kc-breathe">
        <path className="fill-(--char) opacity-80" d="M16 124 C16 98 33 88 50 88 C67 88 84 98 84 124 Z" />
        <Head who={who} />
        <Accessory who={who} />
        <rect className="fill-canvas opacity-95" x="31" y="38" width="38" height="26" rx="12" />
        <g className="kc-blink">
          <ellipse className="fill-ink" cx="41" cy="50" rx="3.2" ry="4.2" />
          <ellipse className="fill-ink" cx="59" cy="50" rx="3.2" ry="4.2" />
        </g>
        {state === "speaking" ? (
          <ellipse className="fill-ink kc-talk" cx="50" cy="58.5" rx="5" ry="3.6" />
        ) : state === "thinking" ? (
          <g className="fill-ink">
            {[0, 1, 2].map((d) => <circle key={d} className="kc-think-dot" style={{ "--d": d } as React.CSSProperties} cx={44 + d * 6} cy="58.5" r="1.8" />)}
          </g>
        ) : (
          <path className="fill-none stroke-ink" d="M44 58 Q50 62.5 56 58" strokeWidth="2" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}
