import { CircleAlert } from "lucide-react";

/** Inline field-level validation message — muted rose, distinct from the
 * alert crimson used for destructive actions. Renders nothing if empty. */
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      className="mt-1.5 flex items-center gap-1 text-xs"
      style={{ color: "var(--field-error)" }}
    >
      <CircleAlert className="h-3 w-3 shrink-0" />
      {children}
    </p>
  );
}
