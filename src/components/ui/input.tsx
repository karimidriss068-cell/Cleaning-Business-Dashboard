import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// 36px, radius-sm, border-input on surface (DESIGN.md section 10).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-sm border border-border-input bg-canvas/40 px-3 shadow-[0_1px_0_rgb(255_255_255/0.03)_inset] focus-visible:shadow-[0_0_0_4px_var(--kc-glow)] text-base text-ink transition-colors duration-fast outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger md:text-sm file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
}

export { Input }
