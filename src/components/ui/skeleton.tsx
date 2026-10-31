import { cn } from "@/lib/utils";

/** Loading placeholder: a glass block with a slow sheen (the sheen stops under reduced motion). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("kc-shimmer rounded-md border border-hairline", className)} {...props} />;
}
