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
        "h-9 w-full min-w-0 rounded-sm border border-border-input bg-surface px-3 text-base text-ink transition-colors duration-fast outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger md:text-sm file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
}

export { Input }
