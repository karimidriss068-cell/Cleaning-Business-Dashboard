import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-sm border border-border-input bg-surface px-3 py-2 text-base text-ink transition-colors duration-fast outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
