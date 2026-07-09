import { CardShell } from "./card-shell";

export function ChartPanel({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <CardShell className="px-6 py-7 sm:px-7 sm:py-8">
      <div className="relative z-10 mb-6">
        <h3 className="font-heading text-lg font-medium tracking-tight">{title}</h3>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="relative z-10">{children}</div>
    </CardShell>
  );
}
