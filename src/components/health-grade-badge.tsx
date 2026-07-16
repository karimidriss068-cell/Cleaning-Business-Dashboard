import { cn } from "@/lib/utils";
import type { HealthGrade } from "@/lib/client-health";

const GRADE_TONE_CLASS: Record<HealthGrade, string> = {
  A: "badge-good",
  B: "badge-warn",
  C: "badge-bad",
};

/** Glanceable client health grade — reuses the same badge tones as
 * StatusBadge (sage/amber/crimson) so it reads consistently wherever
 * accounts are listed, without inventing a new visual language. */
export function HealthGradeBadge({
  grade,
  score,
  className,
}: {
  grade: HealthGrade | null;
  score?: number | null;
  className?: string;
}) {
  if (!grade) {
    return <span className={cn("badge badge-muted", className)}>no data</span>;
  }
  return (
    <span
      className={cn("badge", GRADE_TONE_CLASS[grade], className)}
      title={score !== undefined && score !== null ? `${score}/100` : undefined}
    >
      {grade}
    </span>
  );
}
