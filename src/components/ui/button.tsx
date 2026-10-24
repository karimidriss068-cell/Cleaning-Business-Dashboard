import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

// DESIGN.md section 10: primary, secondary, ghost, danger; sm 28px, md 36px,
// crew 56px. Focus uses the global :focus-visible ring.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-transparent text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-fast ease-standard select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--kc-primary),var(--kc-text)_12%)]",
        secondary: "border-border-input bg-surface text-ink hover:bg-surface-raised aria-expanded:bg-surface-raised",
        ghost: "text-ink hover:bg-surface-raised aria-expanded:bg-surface-raised",
        danger: "bg-danger-fill text-danger-label hover:bg-[color-mix(in_oklab,var(--kc-danger-fill),var(--kc-text)_12%)]",
        link: "h-auto px-0 text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-[13px]",
        default: "h-9 px-3.5",
        crew: "h-14 w-full px-5 text-lg font-semibold [&_svg:not([class*='size-'])]:size-6",
        icon: "size-9",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && <Loader2Icon className="animate-spin" aria-hidden />}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
