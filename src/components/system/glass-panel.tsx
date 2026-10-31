import { cn } from "@/lib/utils";

const levelClass = {
  card: "glass-card",
  popover: "glass-popover",
  modal: "glass-modal",
  sidebar: "glass-sidebar",
  /** Translucent without blur, for repeated tiles in a list. */
  flat: "glass-flat",
  /** Opaque, for crew screens and dense boards where text can't depend on the backdrop. */
  solid: "glass-solid shadow-e1",
} as const;

export type GlassLevel = keyof typeof levelClass;

/**
 * The glass surface (DESIGN.md section 4b). Every new panel, section or
 * tile uses this instead of composing its own background, border and shadow,
 * so the look, the contrast tests and the phone/reduced-effects fallbacks
 * stay in one place. Pick the level by how far the panel floats; use `flat`
 * for items repeated in a list and `solid` where text must not depend on the
 * backdrop (crew screens, dense boards).
 */
export function GlassPanel<T extends React.ElementType = "div">({
  as,
  level = "card",
  className,
  ...props
}: { as?: T; level?: GlassLevel } & Omit<React.ComponentPropsWithoutRef<T>, "as" | "level">) {
  const Tag: React.ElementType = as ?? "div";
  return <Tag className={cn("rounded-md border", levelClass[level], className)} {...props} />;
}
