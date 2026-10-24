import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("kc-enter flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-brand-text uppercase">{eyebrow}</p>}
        <h1 className="font-heading text-[32px] leading-9 font-semibold tracking-[-0.01em] text-ink md:text-[36px] md:leading-10">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
